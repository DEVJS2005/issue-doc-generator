import type { Uso } from "../ia/tipos.js";
import type { Banco } from "./banco.js";

export type Chamada = {
  usuario: string;
  tipo: "gerar" | "refinar";
  provedor: string;
  modelo: string;
  sucesso: boolean;
  codigoErro?: string | null;
  uso?: Uso;
  custoUsd?: number | null;
  duracaoMs: number;
  usouReserva?: boolean;
};

export type Totais = {
  chamadas: number;
  sucessos: number;
  falhas: number;
  tokensEntrada: number;
  tokensSaida: number;
  tokensCacheLeitura: number;
  tokensCacheEscrita: number;
  /** Soma só das chamadas com preço conhecido. */
  custoUsd: number;
  chamadasSemPreco: number;
  duracaoMediaMs: number;
  usouReserva: number;
};

export type ResumoUso = {
  desde: number;
  totais: Totais;
  porDia: ({ dia: string } & Pick<Totais, "chamadas" | "falhas" | "custoUsd">)[];
  porUsuario: ({ usuario: string } & Pick<Totais, "chamadas" | "falhas" | "tokensSaida" | "custoUsd">)[];
  porModelo: ({ modelo: string } & Pick<Totais, "chamadas" | "falhas" | "custoUsd" | "duracaoMediaMs">)[];
  erros: { codigo: string; quantidade: number }[];
  ultimosErros: { quando: number; usuario: string; tipo: string; modelo: string; codigo: string }[];
};

const SOMAS = `
  COUNT(*) AS chamadas,
  COALESCE(SUM(sucesso), 0) AS sucessos,
  COALESCE(SUM(1 - sucesso), 0) AS falhas,
  COALESCE(SUM(tokens_entrada), 0) AS tokensEntrada,
  COALESCE(SUM(tokens_saida), 0) AS tokensSaida,
  COALESCE(SUM(tokens_cache_leitura), 0) AS tokensCacheLeitura,
  COALESCE(SUM(tokens_cache_escrita), 0) AS tokensCacheEscrita,
  COALESCE(SUM(custo_usd), 0) AS custoUsd,
  COALESCE(SUM(CASE WHEN custo_usd IS NULL AND sucesso = 1 THEN 1 ELSE 0 END), 0) AS chamadasSemPreco,
  COALESCE(AVG(duracao_ms), 0) AS duracaoMediaMs,
  COALESCE(SUM(usou_reserva), 0) AS usouReserva`;

const arredondar = (n: number) => Math.round(n * 10_000) / 10_000;

/** Registro de chamadas à IA e os números do painel de uso. */
export class RepositorioUso {
  constructor(private readonly db: Banco) {}

  registrar(c: Chamada, quando = Date.now()) {
    this.db
      .prepare(
        `INSERT INTO chamadas (quando, usuario, tipo, provedor, modelo, sucesso, codigo_erro, tokens_entrada, tokens_saida,
           tokens_cache_leitura, tokens_cache_escrita, custo_usd, duracao_ms, usou_reserva)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        quando,
        c.usuario,
        c.tipo,
        c.provedor,
        c.modelo,
        c.sucesso ? 1 : 0,
        c.codigoErro ?? null,
        c.uso?.entrada ?? 0,
        c.uso?.saida ?? 0,
        c.uso?.cacheLeitura ?? 0,
        c.uso?.cacheEscrita ?? 0,
        c.custoUsd ?? null,
        c.duracaoMs,
        c.usouReserva ? 1 : 0,
      );
  }

  /** Números dos últimos `dias`. Dias agrupados no fuso de São Paulo (UTC−3). */
  resumo(dias: number, agora = Date.now()): ResumoUso {
    const desde = agora - dias * 86_400_000;
    const dia = "strftime('%Y-%m-%d', quando / 1000 - 3 * 3600, 'unixepoch')";
    const totais = this.db.prepare(`SELECT ${SOMAS} FROM chamadas WHERE quando >= ?`).get(desde) as Totais;
    totais.custoUsd = arredondar(totais.custoUsd);
    totais.duracaoMediaMs = Math.round(totais.duracaoMediaMs);

    const porDia = (
      this.db
        .prepare(`SELECT ${dia} AS dia, COUNT(*) AS chamadas, SUM(1 - sucesso) AS falhas, COALESCE(SUM(custo_usd), 0) AS custoUsd
                  FROM chamadas WHERE quando >= ? GROUP BY dia ORDER BY dia`)
        .all(desde) as ResumoUso["porDia"]
    ).map((d) => ({ ...d, custoUsd: arredondar(d.custoUsd) }));

    const porUsuario = (
      this.db
        .prepare(`SELECT usuario, COUNT(*) AS chamadas, SUM(1 - sucesso) AS falhas, COALESCE(SUM(tokens_saida), 0) AS tokensSaida,
                    COALESCE(SUM(custo_usd), 0) AS custoUsd
                  FROM chamadas WHERE quando >= ? GROUP BY usuario ORDER BY chamadas DESC LIMIT 50`)
        .all(desde) as ResumoUso["porUsuario"]
    ).map((u) => ({ ...u, custoUsd: arredondar(u.custoUsd) }));

    const porModelo = (
      this.db
        .prepare(`SELECT modelo, COUNT(*) AS chamadas, SUM(1 - sucesso) AS falhas, COALESCE(SUM(custo_usd), 0) AS custoUsd,
                    COALESCE(AVG(duracao_ms), 0) AS duracaoMediaMs
                  FROM chamadas WHERE quando >= ? GROUP BY modelo ORDER BY chamadas DESC`)
        .all(desde) as ResumoUso["porModelo"]
    ).map((m) => ({ ...m, custoUsd: arredondar(m.custoUsd), duracaoMediaMs: Math.round(m.duracaoMediaMs) }));

    const erros = this.db
      .prepare(`SELECT codigo_erro AS codigo, COUNT(*) AS quantidade FROM chamadas
                WHERE quando >= ? AND sucesso = 0 GROUP BY codigo_erro ORDER BY quantidade DESC`)
      .all(desde) as ResumoUso["erros"];

    const ultimosErros = this.db
      .prepare(`SELECT quando, usuario, tipo, modelo, codigo_erro AS codigo FROM chamadas
                WHERE quando >= ? AND sucesso = 0 ORDER BY quando DESC LIMIT 20`)
      .all(desde) as ResumoUso["ultimosErros"];

    return { desde, totais, porDia, porUsuario, porModelo, erros, ultimosErros };
  }

  expurgar(dias: number, agora = Date.now()): number {
    return Number(this.db.prepare("DELETE FROM chamadas WHERE quando < ?").run(agora - dias * 86_400_000).changes);
  }
}
