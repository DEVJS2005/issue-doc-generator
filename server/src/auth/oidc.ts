import * as client from "openid-client";

/** Dados guardados (selados no cookie) entre a ida ao provedor de identidade e a volta. */
export type EstadoSso = { verificador: string; state: string; nonce: string };

export type ResultadoSso = { email: string | null; emailVerificado: boolean };

/** Provedor de login único. A implementação real é OpenID Connect; nos testes, um falso. */
export interface ProvedorSso {
  readonly rotulo: string;
  /** Domínios cujos e-mails verificados viram usuário comum no 1º login (vazio = só cadastrados). */
  readonly dominiosAutoCadastro: string[];
  iniciar(): Promise<{ url: string; estado: EstadoSso }>;
  concluir(urlDeRetorno: URL, estado: EstadoSso): Promise<ResultadoSso>;
}

export type ConfigOidc = {
  emissor: string;
  clienteId: string;
  clienteSegredo: string;
  urlRetorno: string;
  rotulo: string;
  dominiosAutoCadastro: string[];
};

/**
 * OpenID Connect (Microsoft Entra ID, Google Workspace, Keycloak, Okta…) com Authorization Code
 * + PKCE, `state` e `nonce`. A descoberta (.well-known) é feita no 1º login e reaproveitada.
 */
export function criarProvedorOidc(
  c: ConfigOidc,
  descobrir: () => Promise<client.Configuration> = () => client.discovery(new URL(c.emissor), c.clienteId, c.clienteSegredo),
): ProvedorSso {
  let configuracao: Promise<client.Configuration> | null = null;
  const obter = () => {
    configuracao ??= descobrir().catch((erro) => {
      configuracao = null; // falhou (rede, emissor fora do ar): tenta de novo no próximo login
      throw erro;
    });
    return configuracao;
  };

  return {
    rotulo: c.rotulo,
    dominiosAutoCadastro: c.dominiosAutoCadastro,

    async iniciar() {
      const verificador = client.randomPKCECodeVerifier();
      const estado: EstadoSso = { verificador, state: client.randomState(), nonce: client.randomNonce() };
      const url = client.buildAuthorizationUrl(await obter(), {
        redirect_uri: c.urlRetorno,
        scope: "openid email profile",
        code_challenge: await client.calculatePKCECodeChallenge(verificador),
        code_challenge_method: "S256",
        state: estado.state,
        nonce: estado.nonce,
      });
      return { url: url.href, estado };
    },

    async concluir(urlDeRetorno, estado) {
      const tokens = await client.authorizationCodeGrant(await obter(), urlDeRetorno, {
        pkceCodeVerifier: estado.verificador,
        expectedState: estado.state,
        expectedNonce: estado.nonce,
      });
      const claims = tokens.claims();
      const email = typeof claims?.email === "string" ? claims.email.trim().toLowerCase() : null;
      return { email, emailVerificado: claims?.email_verified === true };
    },
  };
}
