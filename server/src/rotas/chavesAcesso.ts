import { createHash } from "node:crypto";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { usuarioObrigatorio } from "../auth/acesso.js";
import type { Sessoes } from "../auth/sessao.js";
import type { RepositorioChavesAcesso } from "../banco/chavesAcesso.js";
import type { RepositorioSessoes } from "../banco/sessoes.js";
import type { RepositorioUsuarios } from "../banco/usuarios.js";
import { abrirSessao } from "./auth.js";
import { exigirReautenticacao } from "./mfa.js";

const NOME_DO_SISTEMA = "Issue Doc Generator";
const VALIDADE_DESAFIO_MS = 5 * 60_000;

const erro = (codigo: string, mensagem: string, podeTentarDeNovo = false) => ({ erro: { codigo, mensagem, podeTentarDeNovo } });

// A resposta do navegador vai como está para a biblioteca, que confere cada campo.
const Resposta = z.object({ id: z.string().min(1).max(1500) }).passthrough();
const CorpoRegistro = z.object({
  token: z.string().min(1).max(3000),
  resposta: Resposta,
  nome: z.string().trim().max(60).optional(),
});
const CorpoLogin = z.object({ token: z.string().min(1).max(3000), resposta: Resposta });

type Desafio = { c: string; tipo: "registro" | "login"; email?: string };

/** Id opaco da pessoa para o autenticador (não leva o e-mail para o aparelho). */
const idDoUsuario = (email: string) => new Uint8Array(createHash("sha256").update(`issue-doc-generator:${email}`).digest().subarray(0, 16));

/** "Chave do Windows" ou o que der, a partir do user-agent, como nome inicial da chave. */
function nomePadrao(ua: string | undefined): string {
  if (!ua) return "Chave de acesso";
  const sistema = /iPhone|iPad/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : null;
  return sistema ? `Chave do ${sistema}` : "Chave de acesso";
}

/**
 * Chave de acesso (passkey, WebAuthn): login sem senha, que vale como segundo fator. O desafio vai
 * selado (subchave "chave-acesso-desafio", 5 min) e cada um vale uma vez. Só a chave pública
 * fica no banco.
 */
export function registrarChavesAcesso(
  app: FastifyInstance,
  o: {
    urlPublica: { origem: string; dominio: string } | null;
    chaves: RepositorioChavesAcesso;
    sessoes: RepositorioSessoes;
    maxAgeSegundos: number;
    usuarios: RepositorioUsuarios;
    selo: Sessoes;
  },
) {
  const limite = { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } };
  // Desafios já usados, até vencerem (uma instância só, como o resto do limite em memória).
  const usados = new Map<string, number>();
  const gastar = (c: string, agora = Date.now()) => {
    for (const [k, vence] of usados) if (vence <= agora) usados.delete(k);
    if (usados.has(c)) return false;
    usados.set(c, agora + VALIDADE_DESAFIO_MS);
    return true;
  };
  const desligada = (reply: FastifyReply) =>
    reply.code(404).send(erro("chave_acesso_desligada", "Chave de acesso não está configurada neste servidor (falta URL_PUBLICA)."));
  const abrirDesafio = (token: string, tipo: Desafio["tipo"]) => {
    const d = o.selo.abrir<Desafio>(token);
    return d && d.tipo === tipo && gastar(d.c) ? d : null;
  };

  app.get("/api/chaves-acesso", limite, async (request) => {
    const u = usuarioObrigatorio(request);
    return {
      disponivel: o.urlPublica !== null,
      chaves: o.chaves.listar(u.email).map((c) => ({ id: c.id, nome: c.nome, criadaEm: c.criadaEm, ultimoUso: c.ultimoUso })),
    };
  });

  // Cadastrar uma chave pede a senha confirmada há pouco (como as outras ações sensíveis).
  app.post("/api/chaves-acesso/registro/iniciar", limite, async (request, reply) => {
    const u = usuarioObrigatorio(request);
    if (!o.urlPublica) return desligada(reply);
    if (!exigirReautenticacao(request, reply)) return;
    const opcoes = await generateRegistrationOptions({
      rpName: NOME_DO_SISTEMA,
      rpID: o.urlPublica.dominio,
      userID: idDoUsuario(u.email),
      userName: u.email,
      userDisplayName: u.nome,
      attestationType: "none",
      excludeCredentials: o.chaves.listar(u.email).map((c) => ({ id: c.id, transports: c.transportes as never })),
      // Chave que o aparelho guarda (login sem digitar o e-mail) e com biometria ou PIN.
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
    });
    const token = o.selo.selar({ c: opcoes.challenge, tipo: "registro", email: u.email } satisfies Desafio, VALIDADE_DESAFIO_MS);
    reply.header("cache-control", "no-store");
    return { opcoes, token };
  });

  app.post("/api/chaves-acesso/registro/concluir", limite, async (request, reply) => {
    const u = usuarioObrigatorio(request);
    if (!o.urlPublica) return desligada(reply);
    const corpo = CorpoRegistro.safeParse(request.body);
    if (!corpo.success) return reply.code(400).send(erro("entrada_invalida", "Resposta da chave de acesso inválida."));
    const desafio = abrirDesafio(corpo.data.token, "registro");
    if (!desafio || desafio.email !== u.email) return reply.code(400).send(erro("desafio_expirado", "O tempo acabou. Tente cadastrar a chave de novo.", true));
    let verificado;
    try {
      verificado = await verifyRegistrationResponse({
        response: corpo.data.resposta as unknown as RegistrationResponseJSON,
        expectedChallenge: desafio.c,
        expectedOrigin: o.urlPublica.origem,
        expectedRPID: o.urlPublica.dominio,
        requireUserVerification: true,
      });
    } catch (e) {
      request.log.info({ evento: "chave_acesso_recusada", detalhe: String(e) }, "chave de acesso: cadastro recusado");
      return reply.code(400).send(erro("chave_invalida", "Não foi possível cadastrar a chave de acesso. Tente de novo.", true));
    }
    if (!verificado.verified) return reply.code(400).send(erro("chave_invalida", "Não foi possível cadastrar a chave de acesso. Tente de novo.", true));
    const { credential } = verificado.registrationInfo;
    if (o.chaves.buscar(credential.id)) return reply.code(409).send(erro("chave_ja_cadastrada", "Esta chave de acesso já está cadastrada."));
    const nome = corpo.data.nome || nomePadrao(request.headers["user-agent"]);
    o.chaves.criar({ id: credential.id, usuario: u.email, chavePublica: credential.publicKey, contador: credential.counter, transportes: credential.transports ?? [], nome });
    // Cadastrar com biometria ou PIN prova o segundo fator nesta sessão.
    if (request.sessaoId) o.sessoes.marcarMfa(request.sessaoId);
    request.log.info({ evento: "chave_acesso_criada", usuario: u.email }, "chave de acesso: cadastrada");
    return reply.code(201).send({ chave: { id: credential.id, nome } });
  });

  app.delete("/api/chaves-acesso/:id", limite, async (request, reply) => {
    const u = usuarioObrigatorio(request);
    if (!exigirReautenticacao(request, reply)) return;
    const id = String((request.params as { id: string }).id);
    if (!o.chaves.remover(id, u.email)) return reply.code(404).send(erro("nao_encontrado", "Chave de acesso não encontrada."));
    request.log.info({ evento: "chave_acesso_removida", usuario: u.email }, "chave de acesso: removida");
    return { ok: true };
  });

  // Login sem senha. Público: quem chega aqui ainda não tem sessão.
  app.post("/api/login/chave/iniciar", limite, async (_request, reply) => {
    if (!o.urlPublica) return desligada(reply);
    const opcoes = await generateAuthenticationOptions({ rpID: o.urlPublica.dominio, userVerification: "required" });
    reply.header("cache-control", "no-store");
    return { opcoes, token: o.selo.selar({ c: opcoes.challenge, tipo: "login" } satisfies Desafio, VALIDADE_DESAFIO_MS) };
  });

  app.post("/api/login/chave/concluir", limite, async (request, reply) => {
    if (!o.urlPublica) return desligada(reply);
    const recusada = () => reply.code(401).send(erro("chave_invalida", "Não foi possível entrar com a chave de acesso.", true));
    const corpo = CorpoLogin.safeParse(request.body);
    if (!corpo.success) return reply.code(400).send(erro("entrada_invalida", "Resposta da chave de acesso inválida."));
    const desafio = abrirDesafio(corpo.data.token, "login");
    if (!desafio) return reply.code(401).send(erro("desafio_expirado", "O tempo acabou. Tente entrar de novo.", true));
    const chave = o.chaves.buscar(corpo.data.resposta.id);
    const u = chave ? o.usuarios.buscar(chave.usuario) : null;
    if (!chave || !u || !u.ativo) return recusada();
    let verificado;
    try {
      verificado = await verifyAuthenticationResponse({
        response: corpo.data.resposta as unknown as AuthenticationResponseJSON,
        expectedChallenge: desafio.c,
        expectedOrigin: o.urlPublica.origem,
        expectedRPID: o.urlPublica.dominio,
        credential: { id: chave.id, publicKey: chave.chavePublica as never, counter: chave.contador, transports: chave.transportes as never },
        requireUserVerification: true,
      });
    } catch (e) {
      request.log.info({ evento: "login_falhou", via: "chave_acesso", detalhe: String(e) }, "login: chave de acesso recusada");
      return recusada();
    }
    if (!verificado.verified) return recusada();
    o.chaves.usar(chave.id, verificado.authenticationInfo.newCounter);
    const usuario = { email: u.email, nome: u.nome, admin: u.admin };
    request.usuario = usuario; // para a auditoria
    reply.header("set-cookie", abrirSessao(request, o, u.email, true));
    request.log.info({ evento: "login", via: "chave_acesso", usuario: u.email }, "login: ok (chave de acesso)");
    return { usuario, precisaMfa: false };
  });
}
