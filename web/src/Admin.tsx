import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ErroApi, type EstadoAdmin, type UsuarioAdmin, type ValoresAjustes } from "./api";
import { dataHora } from "./Historico";
import { Uso } from "./Uso";

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

  async function buscarModelos() {
    setBuscandoModelos(true);
    setMensagem(null);
    try {
      const r = await api.modelos(form!.provedor);
      setModelos(r.modelos);
      setMensagem({ tipo: "ok", texto: `${r.modelos.length} modelos encontrados na chave. Escolha na lista dos campos de modelo.` });
    } catch (e) {
      falhou(e);
    } finally {
      setBuscandoModelos(false);
    }
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
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

  async function alterarUsuario(u: UsuarioAdmin, mudancas: { admin?: boolean; ativo?: boolean; senha?: string }, sucesso: string) {
    setMensagem(null);
    try {
      const { usuario } = await api.alterarUsuario(u.id, mudancas);
      setUsuarios((lista) => lista.map((x) => (x.id === usuario.id ? usuario : x)));
      setMensagem({ tipo: "ok", texto: sucesso });
    } catch (e) {
      falhou(e);
    }
  }

  function trocarSenha(u: UsuarioAdmin) {
    const senha = window.prompt(`Nova senha para ${u.email} (mínimo 8 caracteres):`);
    if (senha) void alterarUsuario(u, { senha }, `Senha de ${u.email} trocada.`);
  }

  return (
    <>
      <Uso aoSessaoExpirar={aoSessaoExpirar} />
      {mensagem && (
        <p className={mensagem.tipo === "ok" ? "info sucesso" : "erro caixa"} role={mensagem.tipo === "erro" ? "alert" : "status"}>
          {mensagem.texto}
        </p>
      )}

      <form className="cartao" onSubmit={salvar}>
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
              name="modelo"
              list="lista-modelos"
              value={form.modelo}
              placeholder={provedorInfo?.modeloPadrao || "Nome exato do modelo"}
              onChange={(e) => mudar("modelo", e.target.value)}
            />
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
          <button type="button" className="secundario" onClick={buscarModelos} disabled={buscandoModelos || !provedorInfo?.disponivel}>
            {buscandoModelos ? "Buscando…" : "Buscar modelos da chave"}
          </button>
        </div>

        <h2 className="secao">Limites e retenção</h2>
        <div className="linha">
          <label>
            Gerações por pessoa por hora
            <input name="limitePorHora" type="number" min={1} max={1000} value={form.limitePorHora} onChange={(e) => mudar("limitePorHora", Number(e.target.value))} />
          </label>
          <label>
            Tempo limite por geração (segundos)
            <input
              name="tempoLimiteSegundos"
              type="number"
              min={30}
              max={1800}
              value={form.tempoLimiteSegundos}
              onChange={(e) => mudar("tempoLimiteSegundos", Number(e.target.value))}
            />
          </label>
          <label>
            Guardar o histórico por (dias)
            <input name="retencaoDias" type="number" min={1} max={3650} value={form.retencaoDias} onChange={(e) => mudar("retencaoDias", Number(e.target.value))} />
          </label>
        </div>
        <div className="acoes">
          <button type="submit" disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar ajustes"}
          </button>
        </div>
      </form>

      <section className="cartao">
        <h2>Usuários</h2>
        <NovoUsuario
          aoCriar={(u) => {
            setUsuarios((lista) => [...lista, u].sort((a, b) => a.email.localeCompare(b.email)));
            setMensagem({ tipo: "ok", texto: `Usuário ${u.email} criado.` });
          }}
          aoFalhar={falhou}
        />
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead>
              <tr>
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
                    {u.email}
                    {u.email === usuarioAtual && <span className="legenda"> (você)</span>}
                  </td>
                  <td>{u.admin ? "Administrador" : "Usuário"}</td>
                  <td>{u.ativo ? "Ativo" : "Desativado"}</td>
                  <td className="acoes-linha">
                    <button
                      type="button"
                      className="botao-texto"
                      onClick={() => alterarUsuario(u, { admin: !u.admin }, u.admin ? `${u.email} deixou de ser administrador.` : `${u.email} agora é administrador.`)}
                    >
                      {u.admin ? "Tirar admin" : "Tornar admin"}
                    </button>
                    <button
                      type="button"
                      className="botao-texto"
                      onClick={() => alterarUsuario(u, { ativo: !u.ativo }, u.ativo ? `${u.email} desativado.` : `${u.email} reativado.`)}
                    >
                      {u.ativo ? "Desativar" : "Reativar"}
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
    </>
  );
}

function NovoUsuario({ aoCriar, aoFalhar }: { aoCriar: (u: UsuarioAdmin) => void; aoFalhar: (e: unknown) => void }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [admin, setAdmin] = useState(false);

  async function criar(e: FormEvent) {
    e.preventDefault();
    try {
      aoCriar((await api.criarUsuario(email, senha, admin)).usuario);
      setEmail("");
      setSenha("");
      setAdmin(false);
    } catch (err) {
      aoFalhar(err);
    }
  }

  return (
    <form className="novo-usuario" onSubmit={criar}>
      <label>
        E-mail
        <input name="novoEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label>
        Senha inicial
        <input name="novaSenha" type="password" autoComplete="new-password" minLength={8} value={senha} onChange={(e) => setSenha(e.target.value)} required />
      </label>
      <label className="opcao">
        <input type="checkbox" checked={admin} onChange={(e) => setAdmin(e.target.checked)} />
        Administrador
      </label>
      <button type="submit">Criar usuário</button>
    </form>
  );
}
