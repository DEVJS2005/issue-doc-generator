import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  api,
  ErroApi,
  lerSessao,
  transmitir,
  type Entrada,
  type ErroTela,
  type IssueGuardada,
  type Opcoes,
  type Progresso,
  type Resultado,
  type Usuario,
} from "./api";

// Carregados sob demanda: o renderizador de Markdown (o maior pedaço do JavaScript) só baixa
// quando há uma issue para mostrar; Histórico e Administração, quando a aba é aberta.
import { IconeAlerta, IconeSeta, Logo, Rodape, SeletorTema } from "./Interface";

const Markdown = lazy(() => import("./Markdown").then((m) => ({ default: m.Markdown })));
const Historico = lazy(() => import("./Historico").then((m) => ({ default: m.Historico })));
const Admin = lazy(() => import("./Admin").then((m) => ({ default: m.Admin })));
const Versoes = lazy(() => import("./Versoes").then((m) => ({ default: m.Versoes })));
const Carregando = () => <p className="carregando">Carregando…</p>;

const ERROS_SSO: Record<string, string> = {
  expirado: "O login único demorou demais ou foi aberto em outra aba. Tente de novo.",
  email: "O provedor de identidade não informou um e-mail verificado.",
  sem_cadastro: "Seu e-mail ainda não tem acesso. Peça a um administrador para cadastrá-lo.",
  desativado: "Seu acesso está desativado. Fale com um administrador.",
  recusado: "O provedor de identidade recusou o login. Tente de novo.",
  indisponivel: "Não foi possível falar com o provedor de identidade. Tente de novo em instantes.",
};

const AVISO_DADOS = "Não cole dados pessoais reais (usuários, clientes, CPFs). O texto é enviado para processamento por IA.";
const SEGUNDOS_AINDA_GERANDO = 60;

type Pagina = "gerar" | "historico" | "admin";

export function App() {
  const [usuario, setUsuario] = useState<Usuario | null | undefined>(undefined);
  const [precisaConfigurar, setPrecisaConfigurar] = useState(false);
  const [rotuloSso, setRotuloSso] = useState<string | null>(null);
  const [pagina, setPagina] = useState<Pagina>("gerar");
  // Issue aberta do histórico; a chave remonta o Gerador com ela.
  const [aberta, setAberta] = useState<{ chave: number; item: IssueGuardada | null }>({ chave: 0, item: null });
  const codigo = new URLSearchParams(window.location.search).get("codigo");

  useEffect(() => {
    lerSessao().then((s) => {
      setUsuario(s.usuario);
      setPrecisaConfigurar(s.precisaConfigurar);
      setRotuloSso(s.sso);
    });
  }, []);

  const expirou = useCallback(() => setUsuario(null), []);

  function entrou(u: Usuario) {
    if (window.location.search) window.history.replaceState(null, "", window.location.pathname);
    setPrecisaConfigurar(false);
    setPagina("gerar");
    setUsuario(u);
  }

  async function sair() {
    await api.sair().catch(() => undefined);
    setUsuario(null);
  }

  function abrirDoHistorico(item: IssueGuardada) {
    setAberta((a) => ({ chave: a.chave + 1, item }));
    setPagina("gerar");
  }

  function novaIssue() {
    setAberta((a) => ({ chave: a.chave + 1, item: null }));
    setPagina("gerar");
  }

  return (
    <div className="pagina">
      <header className="topo">
        <div className="marca">
          <Logo />
          <div>
            <h1>Issue Doc Generator</h1>
            <p className="subtitulo">Da descrição curta à issue testável, com técnicas do ISTQB CTFL v4.0.1.</p>
          </div>
        </div>
        <div className="lado">
          {usuario && (
            <div className="conta">
              <strong title={usuario.email}>{usuario.nome}</strong>
              {usuario.admin && <span className="selo">admin</span>}
              <button type="button" className="botao-texto" onClick={sair}>
                Sair
              </button>
            </div>
          )}
          <SeletorTema />
        </div>
      </header>
      {usuario && (
        <nav className="abas" aria-label="Seções">
          <button type="button" aria-current={pagina === "gerar" ? "page" : undefined} onClick={() => setPagina("gerar")}>
            Gerar
          </button>
          <button type="button" aria-current={pagina === "historico" ? "page" : undefined} onClick={() => setPagina("historico")}>
            Histórico
          </button>
          {usuario.admin && (
            <button type="button" aria-current={pagina === "admin" ? "page" : undefined} onClick={() => setPagina("admin")}>
              Administração
            </button>
          )}
        </nav>
      )}
      <main>
        {usuario === undefined && <p className="carregando">Carregando…</p>}
        {usuario === null && (
          <div className="entrada">
            <Apresentacao />
            {precisaConfigurar && codigo && <Configurar codigo={codigo} aoEntrar={entrou} />}
            {precisaConfigurar && !codigo && (
              <section className="cartao login">
                <h2>Configuração inicial</h2>
                <p className="legenda">Ainda não há nenhum administrador. Abra o link de configuração que aparece no log do servidor ao iniciar.</p>
              </section>
            )}
            {!precisaConfigurar && (
              <Login aoEntrar={entrou} rotuloSso={rotuloSso} erroSso={ERROS_SSO[new URLSearchParams(window.location.search).get("sso") ?? ""] ?? null} />
            )}
          </div>
        )}
        {usuario && (
          // O Gerador fica montado ao trocar de aba, para não perder uma geração em andamento.
          <div hidden={pagina !== "gerar"}>
            <Gerador key={aberta.chave} aberta={aberta.item} aoNova={novaIssue} aoSessaoExpirar={expirou} />
          </div>
        )}
        <Suspense fallback={<Carregando />}>
          {usuario && pagina === "historico" && <Historico podeVerTodos={usuario.admin} aoAbrir={abrirDoHistorico} aoSessaoExpirar={expirou} />}
          {usuario?.admin && pagina === "admin" && <Admin usuarioAtual={usuario.email} aoSessaoExpirar={expirou} />}
        </Suspense>
      </main>
      <Rodape />
    </div>
  );
}

const ETAPAS = ["Problema", "Solução", "Requisito técnico", "Critérios de aceite", "Casos de teste", "Revisão"];

/** Lado esquerdo da tela de entrada: o que a ferramenta entrega, em uma frase e uma sequência. */
function Apresentacao() {
  return (
    <section className="apresentacao">
      <h2>Da descrição curta à issue pronta para testar.</h2>
      <p>
        Descreva o que está errado ou o que vocês querem. A IA monta a issue completa, marca o que não dá para afirmar como
        [a preencher] e lista as dúvidas para o PO.
      </p>
      <ol className="sequencia" aria-label="Seções da issue gerada">
        {ETAPAS.map((etapa, i) => (
          <li key={etapa}>
            <span>{etapa}</span>
            {i < ETAPAS.length - 1 && <IconeSeta />}
          </li>
        ))}
      </ol>
      <p className="base-istqb">Critérios, casos e revisão seguem as técnicas do ISTQB CTFL v4.0.1.</p>
    </section>
  );
}

function Configurar({ codigo, aoEntrar }: { codigo: string; aoEntrar: (u: Usuario) => void }) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (senha !== confirmacao) return setErro("As senhas não são iguais.");
    setErro(null);
    try {
      aoEntrar((await api.configurar(codigo, nome, email, senha)).usuario);
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : "Não foi possível concluir. Tente de novo.");
    }
  }

  return (
    <form className="cartao login" onSubmit={enviar}>
      <h2>Criar o primeiro administrador</h2>
      <p className="legenda">Depois, os demais usuários são criados na aba Administração.</p>
      <label>
        Nome de usuário
        <input
          autoComplete="username"
          value={nome}
          onChange={(e) => setNome(e.target.value.toLowerCase())}
          placeholder="Ex.: ana.souza"
          pattern="[a-z0-9][a-z0-9._\-]{1,39}"
          title="De 2 a 40 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado."
          required
        />
      </label>
      <label>
        E-mail
        <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label>
        Senha (mínimo 8 caracteres)
        <input type="password" autoComplete="new-password" minLength={8} value={senha} onChange={(e) => setSenha(e.target.value)} required />
      </label>
      <label>
        Confirme a senha
        <input type="password" autoComplete="new-password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} required />
      </label>
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
      <button type="submit">Criar administrador</button>
    </form>
  );
}

function Login({ aoEntrar, rotuloSso, erroSso }: { aoEntrar: (u: Usuario) => void; rotuloSso: string | null; erroSso: string | null }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(erroSso);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      aoEntrar((await api.entrar(email, senha)).usuario);
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : "Não foi possível entrar. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="cartao login" onSubmit={enviar}>
      <h2>Entrar</h2>
      <label>
        Usuário ou e-mail
        <input autoComplete="username" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label>
        Senha
        <input type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
      </label>
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
      <button type="submit" disabled={enviando}>
        {enviando ? "Entrando…" : "Entrar"}
      </button>
      {rotuloSso && (
        <>
          <p className="separador">ou</p>
          {/* Navegação de página inteira: o provedor de identidade não abre dentro de um fetch. */}
          <a className="botao-sso" href="/api/sso/iniciar">
            {rotuloSso}
          </a>
        </>
      )}
    </form>
  );
}

type Execucao = { tipo: "gerar" | "refinar"; inicio: number; progresso: Progresso | null };

function Gerador({ aberta, aoNova, aoSessaoExpirar }: { aberta: IssueGuardada | null; aoNova: () => void; aoSessaoExpirar: () => void }) {
  const [opcoes, setOpcoes] = useState<Opcoes | null>(null);
  const [descricao, setDescricao] = useState(aberta?.entrada.descricao ?? "");
  const [tipo, setTipo] = useState(aberta?.entrada.tipo ?? "");
  const [produto, setProduto] = useState(() => aberta?.entrada.produto ?? lerUltimoProduto());
  const [contexto, setContexto] = useState(aberta?.entrada.contexto ?? "");

  const [execucao, setExecucao] = useState<Execucao | null>(null);
  const [agora, setAgora] = useState(Date.now());
  const [resultado, setResultado] = useState<Resultado | null>(() =>
    aberta
      ? { issue: aberta.issue, markdown: aberta.markdown, avisos: [], alteracoes: null, modelo: aberta.modelo, usouFallback: false, duracaoMs: 0, historicoId: aberta.id }
      : null,
  );
  const [entradaUsada, setEntradaUsada] = useState<Entrada | null>(aberta?.entrada ?? null);
  const [erro, setErro] = useState<{ erro: ErroTela; refazer: () => void } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ajuste, setAjuste] = useState("");
  const [copiado, setCopiado] = useState(false);
  const controle = useRef<AbortController | null>(null);

  useEffect(() => {
    api
      .opcoes()
      .then((o) => {
        setOpcoes(o);
        setTipo((t) => t || (o.tipos[0] ?? ""));
      })
      .catch((e) => (e instanceof ErroApi && e.status === 401 ? aoSessaoExpirar() : setAviso("Não foi possível carregar as opções.")));
  }, [aoSessaoExpirar]);

  useEffect(() => {
    if (!execucao) return;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [execucao]);

  const nomeProduto = produto.trim();

  async function executar(tipoExec: Execucao["tipo"], url: "/api/gerar" | "/api/refinar", corpo: unknown, aoConcluir: (r: Resultado) => void) {
    const c = new AbortController();
    controle.current = c;
    setErro(null);
    setAviso(null);
    setAgora(Date.now());
    setExecucao({ tipo: tipoExec, inicio: Date.now(), progresso: null });
    try {
      const r = await transmitir(url, corpo, c.signal, (p) => setExecucao((ex) => (ex ? { ...ex, progresso: p } : ex)));
      aoConcluir(r);
    } catch (e) {
      if (c.signal.aborted) {
        setAviso("Geração cancelada.");
      } else if (e instanceof ErroApi && e.status === 401) {
        aoSessaoExpirar();
      } else {
        const erroTela =
          e instanceof ErroApi ? e.erro : { codigo: "conexao", mensagem: "Não foi possível falar com o servidor. Tente de novo.", podeTentarDeNovo: true };
        setErro({ erro: erroTela, refazer: () => executar(tipoExec, url, corpo, aoConcluir) });
      }
    } finally {
      controle.current = null;
      setExecucao(null);
    }
  }

  function gerar(e: FormEvent) {
    e.preventDefault();
    const entrada: Entrada = { descricao, tipo, produto: nomeProduto, contexto };
    salvarUltimoProduto(nomeProduto);
    void executar("gerar", "/api/gerar", entrada, (r) => {
      setResultado(r);
      setEntradaUsada(entrada);
      setAjuste("");
    });
  }

  function refinar(e: FormEvent) {
    e.preventDefault();
    if (!resultado || !entradaUsada) return;
    const corpo = { entrada: entradaUsada, issue: resultado.issue, ajuste, historicoId: resultado.historicoId };
    void executar("refinar", "/api/refinar", corpo, (r) => {
      setResultado(r);
      setAjuste("");
    });
  }

  async function copiar() {
    if (!resultado) return;
    await navigator.clipboard.writeText(resultado.markdown);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  function baixar() {
    if (!resultado) return;
    const url = URL.createObjectURL(new Blob([resultado.markdown], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${nomeArquivo(resultado.markdown)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!opcoes) return <p className="carregando">{aviso ?? "Carregando…"}</p>;

  const ocupado = execucao !== null;
  const segundos = execucao ? Math.floor((agora - execucao.inicio) / 1000) : 0;

  return (
    <>
      <form className="cartao" onSubmit={gerar} aria-busy={ocupado}>
        <h2>O que está errado ou o que queremos</h2>
        <div className="aviso-dados" role="note">
          <IconeAlerta />
          <span>{AVISO_DADOS}</span>
        </div>
        <Campo rotulo="Descrição" atual={descricao.length} limite={opcoes.limites.descricao}>
          <textarea
            name="descricao"
            rows={6}
            value={descricao}
            maxLength={opcoes.limites.descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex.: No checkout, o cliente consegue aplicar quantos cupons quiser. Queremos limitar a 3 por pedido."
            required
          />
        </Campo>
        <div className="linha">
          <label>
            Tipo
            <select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {opcoes.tipos.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Nome do produto
            <input
              name="produto"
              value={produto}
              maxLength={120}
              onChange={(e) => setProduto(e.target.value)}
              placeholder="Ex.: Loja Exemplo"
              required
            />
          </label>
        </div>
        <Campo rotulo="Contexto (opcional)" atual={contexto.length} limite={opcoes.limites.contexto}>
          <textarea
            name="contexto"
            rows={4}
            value={contexto}
            maxLength={opcoes.limites.contexto}
            onChange={(e) => setContexto(e.target.value)}
            placeholder="Regras conhecidas, telas, links, protótipo descrito em texto."
          />
        </Campo>
        <div className="acoes">
          <button type="submit" disabled={ocupado || !descricao.trim() || !nomeProduto}>
            Gerar issue
          </button>
        </div>
      </form>

      {execucao && (
        <section className="cartao progresso" aria-live="polite">
          <div className="trilho" aria-hidden="true" />
          <p>
            <strong>{execucao.tipo === "gerar" ? "Gerando a issue" : "Refinando a issue"}</strong>
            {" · "}
            {textoProgresso(execucao.progresso)} · {segundos}s
          </p>
          {segundos >= SEGUNDOS_AINDA_GERANDO && <p className="ainda">Ainda gerando… modelos que raciocinam mais podem levar alguns minutos.</p>}
          <button type="button" className="secundario" onClick={() => controle.current?.abort()}>
            Cancelar
          </button>
        </section>
      )}

      {aviso && <p className="info">{aviso}</p>}
      {erro && (
        <section className="cartao erro" role="alert">
          <p>{erro.erro.mensagem}</p>
          {erro.erro.podeTentarDeNovo && (
            <button type="button" onClick={erro.refazer} disabled={ocupado}>
              Tentar de novo
            </button>
          )}
        </section>
      )}

      {resultado && (
        <section className="cartao resultado">
          <div className="barra">
            <h2>Rascunho da issue</h2>
            <div className="acoes">
              <button type="button" className="secundario" onClick={copiar}>
                {copiado ? "Copiado" : "Copiar Markdown"}
              </button>
              <button type="button" className="secundario" onClick={baixar}>
                Baixar .md
              </button>
              <button type="button" className="botao-texto" onClick={aoNova} disabled={ocupado}>
                Nova issue
              </button>
            </div>
          </div>
          <p className="legenda">
            Revise antes de virar card. <mark className="lacuna">[a preencher]</mark> marca o que a IA não pôde afirmar.
            {resultado.historicoId !== null && " Guardada no histórico."}
          </p>
          {resultado.usouFallback && (
            <p className="alteracoes">O modelo principal estava indisponível: esta versão foi gerada pelo modelo reserva ({resultado.modelo}).</p>
          )}
          {resultado.alteracoes && (
            <p className="alteracoes">
              {resultado.alteracoes.length ? `Mudou neste refinamento: ${resultado.alteracoes.join(", ")}.` : "O refinamento não mudou nada na issue."}
            </p>
          )}
          {resultado.avisos.length > 0 && (
            <div className="avisos">
              <strong>Pontos para conferir</strong>
              <ul>
                {resultado.avisos.map((a, i) => (
                  <li key={i}>{a.mensagem}</li>
                ))}
              </ul>
            </div>
          )}
          <Suspense fallback={<Carregando />}>
            <Markdown fonte={resultado.markdown} />
          </Suspense>
          {resultado.historicoId !== null && (
            <Suspense fallback={<Carregando />}>
              <Versoes historicoId={resultado.historicoId} atualizacao={resultado.markdown} />
            </Suspense>
          )}

          <form className="refinar" onSubmit={refinar}>
            <Campo rotulo="Refinar" atual={ajuste.length} limite={opcoes.limites.ajuste}>
              <textarea
                name="ajuste"
                rows={2}
                value={ajuste}
                maxLength={opcoes.limites.ajuste}
                onChange={(e) => setAjuste(e.target.value)}
                placeholder='Ex.: "troque o status Ativo por Disponível" ou "inclua o limite de 2.500 linhas".'
              />
            </Campo>
            <button type="submit" disabled={ocupado || !ajuste.trim()}>
              Refinar
            </button>
          </form>
        </section>
      )}
    </>
  );
}

function Campo({ rotulo, atual, limite, children }: { rotulo: string; atual: number; limite: number; children: ReactNode }) {
  return (
    <label className="campo">
      <span className="rotulo">
        {rotulo}
        <span className={atual > limite * 0.9 ? "contador perto" : "contador"}>
          {atual.toLocaleString("pt-BR")}/{limite.toLocaleString("pt-BR")}
        </span>
      </span>
      {children}
    </label>
  );
}

// Lembra o último nome de produto só neste navegador, por conveniência. Se o armazenamento
// estiver bloqueado (janela anônima, por exemplo), o campo só começa vazio.
const CHAVE_PRODUTO = "idg:ultimo-produto";

function lerUltimoProduto(): string {
  try {
    return localStorage.getItem(CHAVE_PRODUTO) ?? "";
  } catch {
    return "";
  }
}

function salvarUltimoProduto(nome: string) {
  try {
    localStorage.setItem(CHAVE_PRODUTO, nome);
  } catch {
    // sem armazenamento: segue sem lembrar
  }
}

function textoProgresso(p: Progresso | null) {
  if (!p || p.fase === "analisando") return "analisando a descrição";
  return p.secao ? `escrevendo: ${p.secao}` : "escrevendo";
}

function nomeArquivo(markdown: string) {
  const titulo = markdown.match(/^# (.+)$/m)?.[1] ?? "issue";
  return (
    titulo
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "issue"
  );
}
