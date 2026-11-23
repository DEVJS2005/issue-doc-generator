import { describe, expect, it } from "vitest";
import { ErroFragmento, juntarChangelog, juntarRoadmap, lerFragmento } from "../scripts/changelog.js";

const CHANGELOG = `# Changelog

Texto de abertura.

## [Não lançado]

### Adicionado

- Item antigo adicionado.


### Segurança

- Item antigo de segurança.

## [1.2.0] - 2026-11-17

### Adicionado

- Coisa da 1.2.0.

[Não lançado]: https://github.com/exemplo/projeto/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/exemplo/projeto/releases/tag/v1.2.0
`;

const ROADMAP = `# Roadmap

| # | Item | Estado / estimativa |
|---|---|---|
| 41 | **Sessões revogáveis** | ~4 h |
| 42 | **Limite por conta** | ~2 h |

## Histórico de decisões

- **17/11:**
  - decisão antiga.
`;

const frag = (nome: string, texto: string) => lerFragmento(nome, texto);

describe("fragmentos do changelog", () => {
  it("lê categoria, PR, item do roadmap, decisões e o texto", () => {
    const f = frag("41-sessoes.md", "categoria: Segurança\npr: #51\nroadmap: 41\ndecisao: sessão no SQLite\ndecisao: hash do id\n---\n- Sessões revogáveis.\n");
    expect(f).toEqual({ nome: "41-sessoes.md", categoria: "Segurança", pr: 51, roadmap: "41", decisoes: ["sessão no SQLite", "hash do id"], texto: "- Sessões revogáveis." });
  });

  it("recusa fragmento sem categoria válida, sem separador, sem texto ou com campo desconhecido", () => {
    expect(() => frag("a.md", "categoria: Novidade\n---\n- x")).toThrow(ErroFragmento);
    expect(() => frag("b.md", "categoria: Corrigido\n- x")).toThrow(/---/);
    expect(() => frag("c.md", "categoria: Corrigido\n---\n\n")).toThrow(/vazio/);
    expect(() => frag("d.md", "categoria: Corrigido\nautor: alguem\n---\n- x")).toThrow(/desconhecido/);
    expect(() => frag("e.md", "categoria: Corrigido\npr: abc\n---\n- x")).toThrow(/número do PR/);
  });
});

describe("juntar no CHANGELOG", () => {
  const fragmentos = [
    frag("42-limite.md", "categoria: Segurança\n---\n- Limite de login por conta."),
    frag("41-sessoes.md", "categoria: Segurança\n---\n- Sessões revogáveis."),
    frag("43-doc.md", "categoria: Documentação\n---\n- Guia de proxy."),
  ];

  it("põe cada item no fim da sua categoria, cria a que falta e mantém o que já existia", () => {
    const novo = juntarChangelog(CHANGELOG, fragmentos);
    const secao = novo.slice(novo.indexOf("## [Não lançado]"), novo.indexOf("## [1.2.0]"));
    expect(secao).toBe(
      "## [Não lançado]\n\n### Adicionado\n\n- Item antigo adicionado.\n\n### Segurança\n\n- Item antigo de segurança.\n- Sessões revogáveis.\n- Limite de login por conta.\n\n### Documentação\n\n- Guia de proxy.\n\n",
    );
    expect(novo).toContain("Texto de abertura.");
    expect(novo).toContain("- Coisa da 1.2.0.");
  });

  it("com versão, fecha a seção com a data, abre um 'Não lançado' vazio e acerta os links", () => {
    const novo = juntarChangelog(CHANGELOG, fragmentos, { numero: "1.3.0", data: "2026-11-23" });
    expect(novo).toContain("## [Não lançado]\n\n## [1.3.0] - 2026-11-23\n\n### Adicionado");
    expect(novo).toContain("[Não lançado]: https://github.com/exemplo/projeto/compare/v1.3.0...HEAD\n[1.3.0]: https://github.com/exemplo/projeto/releases/tag/v1.3.0\n[1.2.0]:");
  });

  it("sem fragmentos e sem versão, não muda o conteúdo", () => {
    const novo = juntarChangelog(CHANGELOG, []);
    expect(novo).toContain("### Segurança\n\n- Item antigo de segurança.\n\n## [1.2.0]");
  });
});

describe("juntar no ROADMAP", () => {
  it("marca o item com o PR e acrescenta as decisões com a data", () => {
    const novo = juntarRoadmap(
      ROADMAP,
      [frag("41.md", "categoria: Segurança\npr: 51\nroadmap: 41\ndecisao: sessão no SQLite\ndecisao: hash do id.\n---\n- x")],
      "23/11",
    );
    expect(novo).toContain("| 41 | **Sessões revogáveis** | ✅ PR #51 |");
    expect(novo).toContain("| 42 | **Limite por conta** | ~2 h |");
    expect(novo.endsWith("- **17/11:**\n  - decisão antiga.\n- **23/11:**\n  - sessão no SQLite;\n  - hash do id.\n")).toBe(true);
  });

  it("avisa quando o item não está na tabela", () => {
    expect(() => juntarRoadmap(ROADMAP, [frag("99.md", "categoria: Corrigido\npr: 60\nroadmap: 99\n---\n- x")], "23/11")).toThrow(/item 99/);
  });
});
