import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import QRCode from "qrcode";
import { z } from "zod";
import { usuarioObrigatorio } from "../auth/acesso.js";
import { uriOtpauth } from "../auth/totp.js";
import type { RepositorioMfa } from "../banco/mfa.js";
import type { RepositorioSessoes } from "../banco/sessoes.js";
import type { RepositorioTravasLogin } from "../banco/travas.js";
import type { RepositorioUsuarios } from "../banco/usuarios.js";

/** Por quanto tempo a senha confirmada de novo vale para ações sensíveis. */
export const REAUTENTICACAO_MS = 5 * 60_000;

const erro = (codigo: string, mensagem: string, podeTentarDeNovo = false) => ({ erro: { codigo, mensagem, podeTentarDeNovo } });

const CorpoCodigo = z.object({ codigo: z.string().trim().min(1, "Informe o código.").max(40) });
const CorpoReautenticar = z
  .object({ senha: z.string().max(200).optional(), codigo: z.string().trim().max(40).optional() })
  .refine((c) => !!c.senha || !!c.codigo, { message: "Informe a senha ou o código." });

/**
 * Ações sensíveis (baixar backup, criar ou promover admin) pedem a senha confirmada nos últimos
 * 5 minutos. Devolve true se pode seguir; senão já respondeu 403 "reautenticar".
 */
export function exigirReautenticacao(request: FastifyRequest, reply: FastifyReply, agora = Date.now()): boolean {
  if (agora - (request.reautenticadaEm ?? 0) <= REAUTENTICACAO_MS) return true;
  reply.code(403).send(erro("reautenticar", "Confirme sua senha para continuar."));
  return false;
}

export function registrarMfa(
  app: FastifyInstance,
  o: { mfa: RepositorioMfa; sessoes: RepositorioSessoes; usuarios: RepositorioUsuarios; travas: RepositorioTravasLogin; adminExigeMfa: boolean },
) {
  const exigido = (admin: boolean) => o.adminExigeMfa && admin;

  app.get("/api/mfa", async (request) => {
    const u = usuarioObrigatorio(request);
    return { ativo: o.mfa.ativo(u.email), codigosRestantes: o.mfa.codigosRestantes(u.email), exigido: exigido(u.admin) };
  });

  // Começa a configuração: segredo novo, QR code (SVG gerado aqui, sem serviço externo) e o
  // segredo em texto para digitar no aplicativo. Só vale depois de confirmado com um código.
  app.post("/api/mfa/iniciar", async (request, reply) => {
    const u = usuarioObrigatorio(request);
    const segredo = o.mfa.iniciar(u.email);
    if (!segredo) return reply.code(409).send(erro("mfa_ja_ativo", "A verificação em duas etapas já está ligada."));
    const uri = uriOtpauth(segredo, u.email);
    const svg = await QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
    reply.header("cache-control", "no-store");
    return { segredo, uri, qr: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` };
  });

  app.post("/api/mfa/ativar", async (request, reply) => {
    const u = usuarioObrigatorio(request);
    const corpo = CorpoCodigo.safeParse(request.body);
    if (!corpo.success) return reply.code(400).send(erro("entrada_invalida", corpo.error.issues[0]?.message ?? "Entrada inválida."));
    const codigos = o.mfa.ativar(u.email, corpo.data.codigo);
    if (!codigos) return reply.code(400).send(erro("codigo_invalido", "Código incorreto. Confira a hora do celular e tente de novo.", true));
    // Esta sessão acabou de provar o segundo fator.
    if (request.sessaoId) o.sessoes.marcarMfa(request.sessaoId);
    request.log.info({ evento: "mfa_ativado", usuario: u.email }, "mfa: ligado");
    reply.header("cache-control", "no-store");
    return { codigos };
  });

  app.post("/api/mfa/codigos", async (request, reply) => {
    const u = usuarioObrigatorio(request);
    if (!o.mfa.ativo(u.email)) return reply.code(409).send(erro("mfa_desligado", "A verificação em duas etapas está desligada."));
    if (!exigirReautenticacao(request, reply)) return;
    request.log.info({ evento: "mfa_codigos", usuario: u.email }, "mfa: códigos de recuperação novos");
    reply.header("cache-control", "no-store");
    return { codigos: o.mfa.novosCodigos(u.email) };
  });

  app.post("/api/mfa/desativar", async (request, reply) => {
    const u = usuarioObrigatorio(request);
    if (exigido(u.admin)) return reply.code(403).send(erro("mfa_obrigatorio", "Para administradores, a verificação em duas etapas é obrigatória."));
    if (!exigirReautenticacao(request, reply)) return;
    o.mfa.desativar(u.email);
    request.log.info({ evento: "mfa_desativado", usuario: u.email }, "mfa: desligado");
    return { ok: true };
  });

  // Confirma a senha (ou um código do MFA) de novo, para liberar as ações sensíveis por 5 minutos.
  // Erros contam na trava da conta, como no login.
  app.post("/api/reautenticar", async (request, reply) => {
    const u = usuarioObrigatorio(request);
    const corpo = CorpoReautenticar.safeParse(request.body);
    if (!corpo.success) return reply.code(400).send(erro("entrada_invalida", corpo.error.issues[0]?.message ?? "Entrada inválida."));
    const conta = u.email.toLowerCase();
    const travadaAte = o.travas.travadaAte(conta);
    if (travadaAte) return reply.code(429).send(erro("muitas_tentativas", "Muitas tentativas. Aguarde alguns minutos.", true));
    const ok = corpo.data.senha ? o.usuarios.autenticar(u.email, corpo.data.senha) !== null : o.mfa.conferir(u.email, corpo.data.codigo ?? "") !== null;
    if (!ok) {
      o.travas.registrarFalha(conta);
      return reply.code(401).send(erro("credenciais_invalidas", corpo.data.senha ? "Senha incorreta." : "Código incorreto.", true));
    }
    if (request.sessaoId) o.sessoes.reautenticar(request.sessaoId);
    return { ok: true };
  });
}
