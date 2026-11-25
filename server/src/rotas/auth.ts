import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { ERRO_NAO_AUTENTICADO, ERRO_SEM_PERMISSAO, rotaExigeAdmin, rotaExigeLogin } from "../auth/acesso.js";
import type { Autenticador, Usuario } from "../auth/autenticador.js";
import { Limitador } from "../auth/limite.js";
import { cookieSaida, cookieSessao, tokenDaSessao } from "../auth/sessao.js";
import { ErroValidacao } from "../banco/banco.js";
import type { RepositorioAuditoria } from "../banco/auditoria.js";
import type { RepositorioSessoes } from "../banco/sessoes.js";
import type { RepositorioTravasLogin } from "../banco/travas.js";
import type { RepositorioUsuarios } from "../banco/usuarios.js";

declare module "fastify" {
  interface FastifyRequest {
    usuario?: Usuario;
    /** Id da sessão deste pedido (para marcar "este dispositivo" e encerrar a própria). */
    sessaoId?: number;
  }
}

// `usuario` é o nome de usuário ou o e-mail; `email` continua aceito por compatibilidade.
const CorpoLogin = z
  .object({
    usuario: z.string().trim().max(200).optional(),
    email: z.string().trim().max(200).optional(),
    senha: z.string().min(1, "Informe a senha.").max(200),
  })
  .transform((c) => ({ login: c.usuario || c.email || "", senha: c.senha }))
  .refine((c) => c.login.length > 0, { message: "Informe o usuário ou o e-mail." });

const CorpoConfigurar = z.object({
  codigo: z.string().min(1).max(200),
  nome: z.string().trim().max(40).optional(),
  email: z.string().trim().min(1, "Informe o e-mail.").max(200),
  senha: z.string().max(200),
});

export function seguro(request: FastifyRequest) {
  return request.protocol === "https";
}

function erro(codigo: string, mensagem: string, podeTentarDeNovo = false) {
  return { erro: { codigo, mensagem, podeTentarDeNovo } };
}

export type OpcoesAuth = {
  autenticador: Autenticador;
  sessoes: RepositorioSessoes;
  /** Validade do cookie da sessão, em segundos. */
  maxAgeSegundos: number;
  usuarios: RepositorioUsuarios;
  /** Falhas de login por conta, com espera progressiva (no banco). */
  travas: RepositorioTravasLogin;
  /** Para registrar quando uma conta trava (a auditoria das rotas só vê o pedido). */
  auditoria: RepositorioAuditoria;
  /** Código de uso único para criar o 1º admin; null quando já existe usuário. */
  codigoConfiguracao: { atual: string | null };
  /** Texto do botão de login único; null quando o SSO está desligado. */
  rotuloSso: string | null;
};

/**
 * Usuário da sessão do pedido. A sessão fica no banco; o usuário é relido a cada pedido: desativar
 * alguém ou tirar o perfil de admin vale na hora, sem esperar a sessão vencer.
 */
export function sessaoDaRequisicao(request: FastifyRequest, o: Pick<OpcoesAuth, "sessoes" | "usuarios">): { usuario: Usuario; sessaoId: number } | null {
  const sessao = o.sessoes.buscar(tokenDaSessao(request.headers.cookie, seguro(request)));
  if (!sessao) return null;
  const u = o.usuarios.buscar(sessao.usuario);
  if (!u || !u.ativo) return null;
  // Senha trocada (ou conta desativada) depois que esta sessão foi aberta: não vale mais.
  if (sessao.criadaEm < o.usuarios.sessoesValidasDesde(u.email)) return null;
  return { usuario: { email: u.email, nome: u.nome, admin: u.admin }, sessaoId: sessao.id };
}

/** Abre uma sessão para quem acabou de entrar e devolve os cabeçalhos Set-Cookie. */
export function abrirSessao(request: FastifyRequest, o: Pick<OpcoesAuth, "sessoes" | "maxAgeSegundos">, email: string): string[] {
  const token = o.sessoes.criar(email, { ip: request.ip, navegador: request.headers["user-agent"] ?? null });
  const https = seguro(request);
  // Em HTTPS, apaga o cookie de nome antigo (sem o prefixo __Host-), se houver.
  return [cookieSessao(token, o.maxAgeSegundos, https), ...(https ? cookieSaida(true).slice(1) : [])];
}

export function registrarAuth(app: FastifyInstance, o: OpcoesAuth) {
  // 10 tentativas por IP a cada 15 minutos, para login e para a configuração inicial (em memória).
  // Por conta (nome ou e-mail digitado), a trava fica no banco, com espera progressiva
  // (banco/travas.ts), e vale mesmo quando os pedidos vêm de IPs diferentes.
  const tentativas = new Limitador(10, 15 * 60_000);
  const muitasTentativas = (reply: FastifyReply, liberaEm: number) =>
    reply
      .code(429)
      .header("retry-after", String(Math.max(1, Math.ceil((liberaEm - Date.now()) / 1000))))
      .send(erro("muitas_tentativas", "Muitas tentativas de login. Aguarde alguns minutos.", true));

  // onRequest: barra quem não tem sessão antes de ler o corpo (a geração aceita até 18 MB com prints).
  // Decide pelo padrão da rota que o roteador escolheu, não pela URL recebida: assim o
  // percent-encoding, as maiúsculas ou as barras extras não mudam a regra. Toda rota /api exige
  // login, menos as públicas (auth/acesso.ts). Sem rota registrada, segue para o 404.
  app.addHook("onRequest", async (request, reply) => {
    const rota = request.routeOptions.url;
    if (!rota || !rotaExigeLogin(rota)) return;
    const sessao = sessaoDaRequisicao(request, o);
    if (!sessao) return reply.code(401).send({ erro: ERRO_NAO_AUTENTICADO });
    if (rotaExigeAdmin(rota) && !sessao.usuario.admin) return reply.code(403).send({ erro: ERRO_SEM_PERMISSAO });
    request.usuario = sessao.usuario;
    request.sessaoId = sessao.sessaoId;
  });

  function entrar(request: FastifyRequest, reply: FastifyReply, usuario: Usuario) {
    request.usuario = usuario; // para a auditoria saber quem entrou
    reply.header("set-cookie", abrirSessao(request, o, usuario.email));
    return { usuario };
  }

  app.post("/api/login", async (request, reply) => {
    if (!tentativas.tentar(request.ip).ok) {
      return reply.code(429).send(erro("muitas_tentativas", "Muitas tentativas de login. Aguarde alguns minutos.", true));
    }
    const corpo = CorpoLogin.safeParse(request.body);
    if (!corpo.success) return reply.code(400).send(erro("entrada_invalida", corpo.error.issues[0]?.message ?? "Entrada inválida."));
    const conta = corpo.data.login.normalize("NFKC").toLowerCase();
    // Conta travada: recusa antes de conferir a senha (nem a senha certa entra até a espera acabar).
    const travadaAte = o.travas.travadaAte(conta);
    if (travadaAte) {
      request.log.warn({ evento: "login_conta_limitada" }, "login: conta travada por muitas tentativas");
      return muitasTentativas(reply, travadaAte);
    }
    const usuario = await o.autenticador.autenticar(corpo.data.login, corpo.data.senha);
    if (!usuario) {
      request.log.info({ evento: "login_falhou" }, "login: usuário ou senha incorretos");
      const falha = o.travas.registrarFalha(conta);
      if (falha.travouAgora && falha.travadaAte) {
        const minutos = Math.round((falha.travadaAte - Date.now()) / 60_000);
        request.log.warn({ evento: "login_conta_travada", falhas: falha.falhas, minutos }, "login: conta travada");
        try {
          o.auditoria.registrar({
            quem: "(desconhecido)",
            acao: "login_travado",
            alvo: null,
            detalhe: { conta: corpo.data.login.slice(0, 200), falhas: falha.falhas, minutos },
            ip: request.ip ?? null,
          });
        } catch (e) {
          request.log.warn({ evento: "auditoria_falhou", detalhe: String(e) }, "auditoria: não foi possível registrar");
        }
      }
      return reply.code(401).send(erro("credenciais_invalidas", "Usuário ou senha incorretos.", true));
    }
    tentativas.limpar(request.ip);
    o.travas.limpar(conta);
    request.log.info({ evento: "login", usuario: usuario.email }, "login: ok");
    return entrar(request, reply, usuario);
  });

  // "Sair" encerra a sessão no servidor: o cookie copiado antes disso não vale mais.
  app.post("/api/sair", async (request, reply) => {
    const sessao = sessaoDaRequisicao(request, o);
    if (sessao) request.usuario = sessao.usuario; // para a auditoria
    o.sessoes.encerrarPorToken(tokenDaSessao(request.headers.cookie, seguro(request)));
    reply.header("set-cookie", cookieSaida(seguro(request)));
    return { ok: true };
  });

  app.get("/api/sessao", async (request, reply) => {
    const usuario = sessaoDaRequisicao(request, o)?.usuario;
    if (!usuario) {
      return reply.code(401).send({
        ...erro("nao_autenticado", "Sem sessão."),
        precisaConfigurar: o.codigoConfiguracao.atual !== null,
        sso: o.rotuloSso,
      });
    }
    return { usuario };
  });

  // Configuração inicial: só existe enquanto o banco não tem nenhum usuário.
  app.post("/api/configurar", async (request, reply) => {
    if (!tentativas.tentar(request.ip).ok) {
      return reply.code(429).send(erro("muitas_tentativas", "Muitas tentativas. Aguarde alguns minutos.", true));
    }
    const esperado = o.codigoConfiguracao.atual;
    if (!esperado || o.usuarios.contar() > 0) {
      return reply.code(409).send(erro("ja_configurado", "O primeiro administrador já foi criado. Entre com e-mail e senha."));
    }
    const corpo = CorpoConfigurar.safeParse(request.body);
    if (!corpo.success) return reply.code(400).send(erro("entrada_invalida", corpo.error.issues[0]?.message ?? "Entrada inválida."));
    const a = Buffer.from(corpo.data.codigo);
    const b = Buffer.from(esperado);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return reply.code(403).send(erro("codigo_invalido", "Código de configuração inválido. Use o link que aparece no log do servidor."));
    }
    try {
      const u = o.usuarios.criar(corpo.data.email, corpo.data.senha, true, { nome: corpo.data.nome });
      o.codigoConfiguracao.atual = null;
      request.log.info({ evento: "primeiro_admin", usuario: u.email }, "configuração inicial: primeiro admin criado");
      return entrar(request, reply, { email: u.email, nome: u.nome, admin: true });
    } catch (e) {
      if (e instanceof ErroValidacao) return reply.code(400).send(erro(e.codigo, e.message));
      throw e;
    }
  });
}
