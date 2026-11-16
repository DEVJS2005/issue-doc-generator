import { useEffect, useState } from "react";
import { api, ErroApi, type ResumoUso } from "./api";
import { dataHora } from "./Historico";

const ROTULO_ERRO: Record<string, string> = {
  recusa: "Recusa da IA",
  max_tokens: "Resposta cortada",
  limite_taxa: "Limite de taxa do provedor",
  autenticacao: "Chave recusada",
  servidor: "Provedor instável",
  conexao: "Falha de conexão",
  requisicao_invalida: "Configuração inválida",
  sem_credito: "Conta sem crédito",
  json_invalido: "Resposta fora do formato",
  tempo_esgotado: "Tempo esgotado",
  cancelado: "Cancelada pela pessoa",
  desconhecido: "Erro desconhecido",
};

const dinheiro = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });
const numero = (n: number) => n.toLocaleString("pt-BR");
const segundos = (ms: number) => `${(ms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`;
const dia = (iso: string) => iso.split("-").reverse().join("/");

/** Painel de uso para admins: gerações, falhas, tokens, custo e erros por período. */
export function Uso({ aoSessaoExpirar }: { aoSessaoExpirar: () => void }) {
  const [dias, setDias] = useState(30);
  const [dados, setDados] = useState<ResumoUso | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setErro(null);
    api
      .uso(dias)
      .then(setDados)
      .catch((e) => (e instanceof ErroApi && e.status === 401 ? aoSessaoExpirar() : setErro(e instanceof Error ? e.message : "Algo deu errado.")));
  }, [dias, aoSessaoExpirar]);

  const t = dados?.totais;

  return (
    <section className="cartao">
      <div className="barra">
        <h2>Uso</h2>
        <label className="opcao">
          Período
          <select value={dias} onChange={(e) => setDias(Number(e.target.value))} aria-label="Período">
            <option value={1}>Últimas 24 horas</option>
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={90}>Últimos 90 dias</option>
          </select>
        </label>
      </div>
      {erro && (
        <p className="erro caixa" role="alert">
          {erro}
        </p>
      )}
      {!dados && !erro && <p className="carregando">Carregando…</p>}
      {dados && t && (
        <>
          <div className="indicadores">
            <Indicador rotulo="Gerações e refinamentos" valor={numero(t.chamadas)} />
            <Indicador rotulo="Com falha" valor={numero(t.falhas)} detalhe={t.chamadas ? `${Math.round((t.falhas / t.chamadas) * 100)}% do total` : undefined} />
            <Indicador
              rotulo="Custo estimado"
              valor={dinheiro(t.custoUsd)}
              detalhe={t.chamadasSemPreco ? `${numero(t.chamadasSemPreco)} sem preço conhecido (PRECO_POR_MTOK)` : undefined}
            />
            <Indicador rotulo="Tempo médio" valor={segundos(t.duracaoMediaMs)} />
            <Indicador rotulo="Tokens de saída" valor={numero(t.tokensSaida)} detalhe={`${numero(t.tokensCacheLeitura)} lidos do cache`} />
            <Indicador rotulo="Usaram o modelo reserva" valor={numero(t.usouReserva)} />
          </div>

          {t.chamadas === 0 ? (
            <p className="legenda">Nenhuma geração no período.</p>
          ) : (
            <div className="grade-uso">
              <Tabela
                titulo="Por dia"
                colunas={["Dia", "Gerações", "Falhas", "Custo"]}
                linhas={[...dados.porDia].reverse().map((d) => [dia(d.dia), numero(d.chamadas), numero(d.falhas), dinheiro(d.custoUsd)])}
              />
              <Tabela
                titulo="Por pessoa"
                colunas={["Pessoa", "Gerações", "Falhas", "Custo"]}
                linhas={dados.porUsuario.map((u) => [u.usuario, numero(u.chamadas), numero(u.falhas), dinheiro(u.custoUsd)])}
              />
              <Tabela
                titulo="Por modelo"
                colunas={["Modelo", "Gerações", "Falhas", "Tempo médio", "Custo"]}
                linhas={dados.porModelo.map((m) => [m.modelo, numero(m.chamadas), numero(m.falhas), segundos(m.duracaoMediaMs), dinheiro(m.custoUsd)])}
              />
              {dados.erros.length > 0 && (
                <Tabela
                  titulo="Falhas por motivo"
                  colunas={["Motivo", "Quantidade"]}
                  linhas={dados.erros.map((e) => [ROTULO_ERRO[e.codigo] ?? e.codigo, numero(e.quantidade)])}
                />
              )}
            </div>
          )}

          {dados.ultimosErros.length > 0 && (
            <Tabela
              titulo="Últimas falhas"
              colunas={["Quando", "Pessoa", "Tipo", "Modelo", "Motivo"]}
              linhas={dados.ultimosErros.map((e) => [dataHora(e.quando), e.usuario, e.tipo === "gerar" ? "Gerar" : "Refinar", e.modelo, ROTULO_ERRO[e.codigo] ?? e.codigo])}
            />
          )}
        </>
      )}
    </section>
  );
}

function Indicador({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="indicador">
      <span className="indicador-rotulo">{rotulo}</span>
      <strong className="indicador-valor">{valor}</strong>
      {detalhe && <span className="legenda">{detalhe}</span>}
    </div>
  );
}

function Tabela({ titulo, colunas, linhas }: { titulo: string; colunas: string[]; linhas: string[][] }) {
  return (
    <div className="tabela-rolagem">
      <h3 className="titulo-tabela">{titulo}</h3>
      <table className="tabela">
        <thead>
          <tr>
            {colunas.map((c, i) => (
              <th key={c} className={i > 0 ? "numero" : undefined}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i}>
              {l.map((v, j) => (
                <td key={j} className={j > 0 ? "numero" : undefined}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
