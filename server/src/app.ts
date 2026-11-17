import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { Ajustes } from "./ajustes/ajustes.js";
import { criarAutenticadorBanco, lerUsuariosDoEnv, type Autenticador } from "./auth/autenticador.js";
import { criarProvedorOidc, type ProvedorSso } from "./auth/oidc.js";
import { registrarSso } from "./rotas/sso.js";
import { criarSessoes } from "./auth/sessao.js";
import { Backups } from "./banco/backup.js";
import { abrirBanco } from "./banco/banco.js";
import { RepositorioConfiguracao } from "./banco/configuracao.js";
import { RepositorioHistorico } from "./banco/historico.js";
import { RepositorioLinks } from "./banco/links.js";
import { RepositorioUsuarios } from "./banco/usuarios.js";
import type { Config } from "./config.js";
import { criarProvedor } from "./ia/index.js";
import type { Provedor } from "./ia/tipos.js";
import { TIPOS_ISSUE } from "./issue/schema.js";
import { registrarAdmin } from "./rotas/admin.js";
import { registrarAuth } from "./rotas/auth.js";
import { LIMITE_CONTEXTO, LIMITE_DESCRICAO, registrarRotaGerar } from "./rotas/gerar.js";
import { registrarHistorico } from "./rotas/historico.js";
import { registrarLinks } from "./rotas/links.js";
import { LIMITE_AJUSTE, registrarRotaRefinar } from "./rotas/refinar.js";

const pastaWebPadrao = fileURLToPath(new URL("../../web/dist", import.meta.url));
const EXPURGO_A_CADA_MS = 6 * 3_600_000;

export type OpcoesApp = {
  pastaWeb?: string;
  /** Provedor fixo (testes). Se omitido, é criado a partir da configuração em uso. */
  provedor?: Provedor | null;
  /** Fábrica de provedores (testes da administração). */
  fabricaProvedor?: (c: Config) => Provedor | null;
  /** Login. Se omitido, usa os usuários do banco. */
  autenticador?: Autenticador;
  /** Código fixo da configuração inicial (testes). Se omitido, é aleatório. */
  codigoConfiguracao?: string;
  /** Provedor de login único (testes). Se omitido, vem de OIDC_* no .env. */
  sso?: ProvedorSso | null;
};

export async function montarApp(config: Config, opcoes: OpcoesApp = {}) {
  const app = Fastify({
    logger: { level: process.env.NODE_ENV === "test" ? "silent" : "info" },
    trustProxy: config.confiarProxy,
  });

  const banco = abrirBanco(config.arquivoBanco);
  const usuarios = new RepositorioUsuarios(banco);
  const historico = new RepositorioHistorico(banco);
  const fixo = opcoes.provedor;
  const fabrica = opcoes.fabricaProvedor ?? (fixo !== undefined ? () => fixo : criarProvedor);
  const ajustes = new Ajustes(config, new RepositorioConfiguracao(banco), fabrica, (m) => app.log.warn(m));

  // Banco novo: importa os usuários do formato antigo (USUARIOS_PERMITIDOS) uma vez, com o 1º
  // como admin; sem eles, gera um código de uso único para criar o 1º admin pela tela.
  const codigoConfiguracao: { atual: string | null } = { atual: null };
  if (usuarios.contar() === 0) {
    const antigos = lerUsuariosDoEnv(config.usuariosPermitidos);
    antigos.forEach((u, i) => usuarios.criar(u.email, u.senha, i === 0, { validar: false }));
    if (antigos.length) {
      app.log.warn(
        `Importados ${antigos.length} usuário(s) de USUARIOS_PERMITIDOS; ${antigos[0].email} virou admin. ` +
          "Agora os usuários ficam no banco: pode tirar USUARIOS_PERMITIDOS do .env.",
      );
    } else {
      codigoConfiguracao.atual = opcoes.codigoConfiguracao ?? randomBytes(18).toString("base64url");
      app.log.warn(
        `Nenhum usuário cadastrado. Para criar o primeiro administrador, abra: ` +
          `http://localhost:${config.porta}/configurar?codigo=${codigoConfiguracao.atual} ` +
          "(o link vale uma vez e muda a cada reinício até alguém usá-lo).",
      );
    }
  }

  const sessoes = criarSessoes(config.segredoSessao, config.sessaoHoras);
  if (sessoes.segredoTemporario) {
    app.log.warn("SEGREDO_SESSAO vazio: usando um segredo temporário; as sessões caem quando o servidor reinicia.");
  }
  if (!ajustes.provedor()) {
    app.log.warn("Nenhum provedor de IA pronto: confira a chave no .env e o provedor e o modelo na administração.");
  } else {
    const c = ajustes.config();
    app.log.info(`IA: provedor ${c.provedor}, modelo ${c.modelo}, esforço ${c.esforco}`);
  }

  // Retenção do histórico e backup diário do banco: agora e a cada 6 horas. O backup só roda se o
  // último tiver mais de 24 h; falha no backup vira aviso no log e não derruba o servidor.
  const backups = new Backups(banco, config.arquivoBanco);
  const expurgar = () => {
    const apagadas = historico.expurgar(ajustes.valores().retencaoDias);
    if (apagadas) app.log.info({ evento: "expurgo", apagadas }, `histórico: ${apagadas} issue(s) antiga(s) apagada(s)`);
    try {
      const feito = backups.diario(ajustes.valores().backupCopias);
      if (feito) app.log.info({ evento: "backup", nome: feito.nome, bytes: feito.bytes }, `backup: ${feito.nome}`);
    } catch (erro) {
      app.log.warn({ evento: "backup_falhou", detalhe: String(erro) }, "backup: não foi possível copiar o banco");
    }
  };
  expurgar();
  const timerExpurgo = setInterval(expurgar, EXPURGO_A_CADA_MS);
  timerExpurgo.unref();
  app.addHook("onClose", async () => {
    clearInterval(timerExpurgo);
    banco.close();
  });

  app.get("/api/saude", async () => {
    const c = ajustes.config();
    return { ok: true, provedor: c.provedor, modelo: c.modelo };
  });

  const sso = opcoes.sso !== undefined ? opcoes.sso : config.oidc ? criarProvedorOidc(config.oidc) : null;
  if (sso) app.log.info(`Login único (OIDC) ligado: ${config.oidc?.emissor ?? "provedor de teste"}`);

  // Login primeiro: o hook dele bloqueia (401/403) as rotas protegidas.
  registrarAuth(app, {
    autenticador: opcoes.autenticador ?? criarAutenticadorBanco(usuarios),
    sessoes,
    usuarios,
    codigoConfiguracao,
    rotuloSso: sso?.rotulo ?? null,
  });
  registrarSso(app, {
    sso,
    sessoes,
    usuarios,
    urlRetorno: config.oidc?.urlRetorno ?? `http://localhost:${config.porta}/api/sso/retorno`,
  });

  app.get("/api/opcoes", async () => ({
    tipos: TIPOS_ISSUE,
    limites: { descricao: LIMITE_DESCRICAO, contexto: LIMITE_CONTEXTO, ajuste: LIMITE_AJUSTE },
  }));

  const opcoesGeracao = { config, ajustes, historico };
  registrarRotaGerar(app, opcoesGeracao);
  registrarRotaRefinar(app, opcoesGeracao);
  registrarHistorico(app, { historico, usuarios });
  registrarLinks(app, { historico, links: new RepositorioLinks(banco), usuarios });
  registrarAdmin(app, { ajustes, usuarios, backups });

  // Em produção o servidor também entrega o build do web/.
  const pastaWeb = opcoes.pastaWeb ?? pastaWebPadrao;
  if (existsSync(path.join(pastaWeb, "index.html"))) {
    await app.register(fastifyStatic, { root: pastaWeb });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) {
        return reply.code(404).send({ erro: "Rota não encontrada." });
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}
