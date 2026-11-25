import { describe, expect, it } from "vitest";
import { descreverNavegador } from "../src/Sessoes";

describe("descrição do navegador na lista de sessões", () => {
  it("mostra navegador e sistema dos casos comuns", () => {
    expect(descreverNavegador("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36")).toBe("Chrome no Windows");
    expect(descreverNavegador("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0")).toBe("Edge no Windows");
    expect(descreverNavegador("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15")).toBe("Safari no macOS");
    expect(descreverNavegador("Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0")).toBe("Firefox no Linux");
    expect(descreverNavegador("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1")).toBe("Chrome no iOS");
    expect(descreverNavegador("Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36")).toBe("Chrome no Android");
  });

  it("sem user-agent ou com um desconhecido, mostra algo legível e curto", () => {
    expect(descreverNavegador(null)).toBe("Navegador desconhecido");
    expect(descreverNavegador("curl/8.10")).toBe("curl/8.10");
    expect(descreverNavegador("x".repeat(300))).toHaveLength(60);
  });
});
