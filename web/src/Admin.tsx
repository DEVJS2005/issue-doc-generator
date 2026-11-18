import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ErroApi, type EstadoAdmin, type InfoBackup, type UsuarioAdmin, type ValoresAjustes } from "./api";
import { Auditoria } from "./Auditoria";
import { useDialogo } from "./Dialogo";
import { ERRO_NOME, PADRAO_NOME, useValidacao } from "./Formulario";
import { dataHora } from "./Historico";

const ESFORCOS: { valor: ValoresAjustes["esforco"]; rotulo: string }[] = [
  { valor: "low", rotulo: "Baixo (mais rápido)" },
  { valor: "medium", rotulo: "Médio" },
  { valor: "high", rotulo: "Alto" },
  { valor: "xhigh", rotulo: "Muito alto" },
  { valor: "max", rotulo: "Máximo (mais lento e caro)" },
];

const ROTULO_CHAVE: Record<string, string> = {
  provedor: "Provedor",
  modelo: "Modelo",
  modeloReserva: "Modelo reserva",
  esforco: "Esforço",
  limitePorHora: "Limite por hora",
  tempoLimiteSegundos: "Tempo limite (s)",
  retencaoDias: "Retenção (dias)",
  backupCopias: "Backups guardados",
};

function valorTexto(v: unknown) {
  return v === null || v === undefined || v === "" ? "—" : String(v);
}

export function Admin({ usuarioAtual, aoSessaoExpirar }: { usuarioAtual: string; aoSessaoExpirar: () => void }) {
  const [estado, setEstado] = useState<EstadoAdmin | null>(null);
  const [form, setForm] = useState<ValoresAjustes | null>(null);
  const [modelos, setModelos] = useState<string[]>([]);
  const [buscandoModelos, setBuscandoModelos] = useState(false);
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const dialogo = useDialogo();
  const v = useValidacao();

  const falhou = useCallback(
    (e: unknown) => {
      if (e instanceof ErroApi && e.status === 401) return aoSessaoExpirar();
      setMensagem({ tipo: "erro", texto: e instanceof Error ? e.message : "Algo deu errado." });
    },
    [aoSessaoExpirar],
  );

  useEffect(() => {
    api
      .ajustes()
      .then((r) => {
        setEstado(r);
        setForm(r.valores);
      })
      .catch(falhou);
    api
      .usuarios()
      .then((r) => setUsuarios(r.usuarios))
      .catch(falhou);
  }, [falhou]);

  if (!estado || !form) return <p className="carregando">{mensagem?.texto ?? "Carregando…"}</p>;

  const provedorInfo = estado.provedores.find((p) => p.nome === form.provedor);
  const mudar = <K extends keyof ValoresAjustes>(chave: K, valor: ValoresAjustes[K]) => setForm({ ...form, [chave]: valor });

  async function buscarModelos(provedor = form!.provedor) {
    setBuscandoModelos(true);
    setMensagem(null);
    try {
      const r = await api.modelos(provedor);
      setModelos(r.modelos);
      setMensagem({ tipo: "ok", texto: `${r.modelos.length} modelos encontrados na chave. Escolha no campo Modelo (as opções aparecem ao clicar nele).` });
    } catch (e) {
      falhou(e);
    } finally {
      setBuscandoModelos(false);
    }
  }

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!v.validar(e.currentTarget)) return;
    setSalvando(true);
    setMensagem(null);
    try {
      const r = await api.salvarAjustes(form!);
      setEstado(r);
      setForm(r.valores);
      setMensagem({ tipo: "ok", texto: "Ajustes salvos. Valem a partir da próxima geração." });
    } catch (err) {
      falhou(err);
    } finally {
      setSalvando(false);
    }
  }

  async function alterarUsuario(u: UsuarioAdmin, mudancas: { nome?: string; admin?: boolean; ativo?: boolean; senha?: string }, sucesso: string) {
    setMensagem(null);
    try {
      const { usuario } = await api.alterarUsuario(u.id, mudancas);
      setUsuarios((lista) => lista.map((x) => (x.id === usuario.id ? usuario : x)));
      setMensagem({ tipo: "ok", texto: sucesso });
    } catch (e) {
      falhou(e);
    }
  }

  async function trocarSenha(u: UsuarioAdmin) {
    const senha = await dialogo.pedirTexto({
      titulo: `Trocar a senha de ${u.nome}`,
      mensagem: "A pessoa usa a senha nova no próximo login. As sessões abertas continuam valendo.",
      rotulo: "Nova senha (mínimo 8 caracteres)",
      senha: true,
      minimo: 8,
      acao: "Trocar senha",
    });
    if (senha) void alterarUsuario(u, { senha }, `Senha de ${u.nome} trocada.`);
  }

  async function trocarNome(u: UsuarioAdmin) {
    const nome = await dialogo.pedirTexto({
      titulo: "Trocar o nome de usuário",
      mensagem: `Conta ${u.email}. A pessoa passa a entrar com o nome novo (o e-mail continua valendo).`,
      rotulo: "Nome de usuário",
      valor: u.nome,
      padrao: PADRAO_NOME,
      erroPadrao: ERRO_NOME,
      normalizar: (v) => v.trim().toLowerCase(),
      acao: "Salvar nome",
    });
    if (nome && nome !== u.nome) void alterarUsuario(u, { nome }, `Nome de usuário trocado para ${nome}.`);
  }

  return (
    <>
      {mensagem && (
        <p className={mensagem.tipo === "ok" ? "info sucesso" : "erro caixa"} role={mensagem.tipo === "erro" ? "alert" : "status"}>
          {mensagem.texto}
        </p>
      )}

      <form className="cartao" onSubmit={salvar} noValidate>
        <h2>Inteligência artificial</h2>
        <p className="legenda">As chaves de API ficam no .env do servidor. Aqui você escolhe qual provedor e qual modelo usar.</p>
        <div className="linha">
          <label>
            Provedor
            <select
              name="provedor"
              value={form.provedor}
              onChange={(e) => {
                const nome = e.target.value as ValoresAjustes["provedor"];
                const info = estado.provedores.find((p) => p.nome === nome);
                setModelos([]);
                setForm({ ...form, provedor: nome, modelo: info?.modeloPadrao ?? "", modeloReserva: "" });
                v.limpar("modelo");
                // Sem modelo padrão: já traz a lista da chave para as sugestões do campo.
                if (info?.disponivel && !info.modeloPadrao) void buscarModelos(nome);
              }}
            >
              {estado.provedores.map((p) => (
                <option key={p.nome} value={p.nome} disabled={!p.disponivel}>
                  {p.rotulo}
                  {p.disponivel ? "" : " (sem chave)"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Esforço
            <select name="esforco" value={form.esforco} onChange={(e) => mudar("esforco", e.target.value as ValoresAjustes["esforco"])}>
              {ESFORCOS.map((x) => (
                <option key={x.valor} value={x.valor}>
                  {x.rotulo}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="linha">
          <label>
            Modelo
            <input
              {...v.campo("modelo")}
              list="lista-modelos"
              value={form.modelo}
              placeholder={provedorInfo?.modeloPadrao || "Nome exato do modelo"}
              required
              data-vazio="Escolha o modelo: digite o nome exato ou use “Buscar modelos da chave”."
              onChange={(e) => mudar("modelo", e.target.value)}
            />
            {v.erro("modelo")}
          </label>
          <label>
            Modelo reserva (opcional)
            <input
              name="modeloReserva"
              list="lista-modelos"
              value={form.modeloReserva}
              placeholder="Usado se o principal estiver sobrecarregado"
              onChange={(e) => mudar("modeloReserva", e.target.value)}
            />
          </label>
        </div>
        <datalist id="lista-modelos">
          {modelos.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <div className="acoes">
          <button type="button" className="secundario" onClick={() => buscarModelos()} disabled={buscandoModelos || !provedorInfo?.disponivel}>
            {buscandoModelos ? "Buscando…" : "Buscar modelos da chave"}
          </button>
        </div>

        <h2 className="secao">Limites e retenção</h2>
        <div className="linha">
          <label>
            Gerações por pessoa por hora
            <input {...v.campo("limitePorHora")} type="number" min={1} max={1000} value={form.limitePorHora} onChange={(e) => mudar("limitePorHora", Number(e.target.value))} />
            {v.erro("limitePorHora")}
          </label>
          <label>
            Tempo limite por geração (segundos)
            <input
              {...v.campo("tempoLimiteSegundos")}
              type="number"
              min={30}
              max={1800}
              value={form.tempoLimiteSegundos}
              onChange={(e) => mudar("tempoLimiteSegundos", Number(e.target.value))}
            />
            {v.erro("tempoLimiteSegundos")}
          </label>
          <label>
            Guardar o histórico por (dias)
            <input {...v.campo("retencaoDias")} type="number" min={1} max={3650} value={form.retencaoDias} onChange={(e) => mudar("retencaoDias", Number(e.target.value))} />
            {v.erro("retencaoDias")}
          </label>
          <label>
            Backups do banco guardados
            <input {...v.campo("backupCopias")} type="number" min={1} max={90} value={form.backupCopias} onChange={(e) => mudar("backupCopias", Number(e.target.value))} />
            {v.erro("backupCopias")}
          </label>
        </div>
        <div className="acoes">
          <button type="submit" disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar ajustes"}
          </button>
        </div>
      </form>

      <Backups aoFalhar={falhou} />

      <section className="cartao">
        <h2>Usuários</h2>
        <NovoUsuario
          aoCriar={(u) => {
            setUsuarios((lista) => [...lista, u].sort((a, b) => a.nome.localeCompare(b.nome)));
            setMensagem({ tipo: "ok", texto: `Usuário ${u.nome} criado.` });
          }}
          aoFalhar={falhou}
        />
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>E-mail</th>
                <th>Perfil</th>
                <th>Situação</th>
                <th>
                  <span className="sr">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className={u.ativo ? "" : "inativo"}>
                  <td>
                    {u.nome}
                    {u.email === usuarioAtual && <span className="legenda"> (você)</span>}
                  </td>
                  <td className="secundaria">{u.email}</td>
                  <td>{u.admin ? "Administrador" : "Usuário"}</td>
                  <td>{u.ativo ? "Ativo" : "Desativado"}</td>
                  <td className="acoes-linha">
                    <button
                      type="button"
                      className="botao-texto"
                      onClick={() => alterarUsuario(u, { admin: !u.admin }, u.admin ? `${u.nome} deixou de ser administrador.` : `${u.nome} agora é administrador.`)}
                    >
                      {u.admin ? "Tirar admin" : "Tornar admin"}
                    </button>
                    <button
                      type="button"
                      className="botao-texto"
                      onClick={() => alterarUsuario(u, { ativo: !u.ativo }, u.ativo ? `${u.nome} desativado.` : `${u.nome} reativado.`)}
                    >
                      {u.ativo ? "Desativar" : "Reativar"}
                    </button>
                    <button type="button" className="botao-texto" onClick={() => trocarNome(u)}>
                      Trocar nome
                    </button>
                    <button type="button" className="botao-texto" onClick={() => trocarSenha(u)}>
                      Trocar senha
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="cartao">
        <h2>Alterações recentes nos ajustes</h2>
        {estado.alteracoes.length === 0 ? (
          <p className="legenda">Nenhuma alteração ainda: os valores atuais vêm do .env.</p>
        ) : (
          <ul className="alteracoes-lista">
            {estado.alteracoes.map((a, i) => (
              <li key={i}>
                {dataHora(a.quando)} · {a.quem} · <strong>{ROTULO_CHAVE[a.chave] ?? a.chave}</strong>: {valorTexto(a.de)} → {valorTexto(a.para)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Auditoria aoFalhar={falhou} />
    </>
  );
}

function tamanho(bytes: number) {
  return bytes >= 1_048_576 ? `${(bytes / 1_048_576).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

/** Backup do banco: um por dia, sozinho; aqui dá para fazer um agora e baixar qualquer um. */
function Backups({ aoFalhar }: { aoFalhar: (e: unknown) => void }) {
  const [estado, setEstado] = useState<{ disponivel: boolean; copias: number; backups: InfoBackup[] } | null>(null);
  const [fazendo, setFazendo] = useState(false);

  const carregar = useCallback(() => {
    api.backups().then(setEstado).catch(aoFalhar);
  }, [aoFalhar]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function fazer() {
    setFazendo(true);
    try {
      await api.fazerBackup();
      carregar();
    } catch (e) {
      aoFalhar(e);
    } finally {
      setFazendo(false);
    }
  }

  if (!estado) return null;
  return (
    <section className="cartao">
      <div className="barra">
        <h2>Backup do banco</h2>
        {estado.disponivel && (
          <button type="button" className="secundario" onClick={fazer} disabled={fazendo}>
            {fazendo ? "Fazendo backup…" : "Fazer backup agora"}
          </button>
        )}
      </div>
      {!estado.disponivel ? (
        <p className="legenda">O banco está em memória (modo de teste): não há backup.</p>
      ) : (
        <>
          <p className="legenda">
            Um backup por dia, feito sozinho, na pasta <code>backups</code> ao lado do banco. Ficam os {estado.copias} mais novos. O arquivo
            tem os usuários (senhas só como hash) e o histórico: guarde-o com cuidado.
          </p>
          {estado.backups.length === 0 ? (
            <p className="legenda">Nenhum backup ainda.</p>
          ) : (
            <ul className="lista-backups">
              {estado.backups.map((b) => (
                <li key={b.nome}>
                  <span>
                    {dataHora(b.criadoEm)} · {tamanho(b.bytes)}
                  </span>
                  <a href={`/api/admin/backups/${encodeURIComponent(b.nome)}`} download>
                    Baixar
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function NovoUsuario({ aoCriar, aoFalhar }: { aoCriar: (u: UsuarioAdmin) => void; aoFalhar: (e: unknown) => void }) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [admin, setAdmin] = useState(false);
  const v = useValidacao();

  async function criar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!v.validar(e.currentTarget)) return;
    try {
      aoCriar((await api.criarUsuario(nome, email, senha, admin)).usuario);
      setNome("");
      setEmail("");
      setSenha("");
      setAdmin(false);
    } catch (err) {
      aoFalhar(err);
    }
  }

  return (
    <form className="novo-usuario" onSubmit={criar} noValidate>
      <label>
        Nome de usuário
        <input
          {...v.campo("novoNome")}
          value={nome}
          onChange={(e) => setNome(e.target.value.toLowerCase())}
          placeholder="Vazio = parte do e-mail"
          pattern={PADRAO_NOME}
          data-erro={ERRO_NOME}
        />
        {v.erro("novoNome")}
      </label>
      <label>
        E-mail
        <input {...v.campo("novoEmail")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        {v.erro("novoEmail")}
      </label>
      <label>
        Senha inicial
        <input {...v.campo("novaSenha")} type="password" autoComplete="new-password" minLength={8} value={senha} onChange={(e) => setSenha(e.target.value)} required />
        {v.erro("novaSenha")}
      </label>
      <label className="opcao">
        <input type="checkbox" checked={admin} onChange={(e) => setAdmin(e.target.checked)} />
        Administrador
      </label>
      <button type="submit">Criar usuário</button>
    </form>
  );
}
