// @vitest-environment node
/**
 * O repasse da conversa age com o token de quem pergunta e não pode bufferizar: cada evento do agente tem de chegar à
 * tela assim que sai de lá.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarRede, json } from "@/testes/rede";
import { POST } from "./route";

const pedido = (headers: Record<string, string> = {}) =>
  new Request("http://localhost:3000/srv/agente/conversa", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ sessao_id: "s1", obra_id: "o1", texto: "oi" }),
  });

beforeEach(() => {
  vi.stubEnv("CANTEIRO_DEMO", "");
  vi.stubEnv("AGENTE_URL", "http://agente.teste");
  vi.stubEnv("PROXY_SEGREDO", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /srv/agente/conversa", () => {
  it("repassa o Authorization e o corpo, sem o cookie", async () => {
    const rede = criarRede({ "POST /conversa": () => new Response("event: fim\ndata: {}\n\n", { headers: { "content-type": "text/event-stream" } }) });
    const r = await POST(pedido({ authorization: "Bearer acesso-1", cookie: "canteiro_renovacao=segredo" }));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/event-stream");
    const c = rede.chamadas[0]!;
    expect(c.url.href).toBe("http://agente.teste/conversa");
    const h = new Headers(c.init.headers);
    expect(h.get("authorization")).toBe("Bearer acesso-1");
    expect(h.get("accept")).toBe("text/event-stream");
    expect(h.get("cookie")).toBeNull();
    expect(JSON.parse(new TextDecoder().decode(c.init.body as ArrayBuffer))).toEqual({ sessao_id: "s1", obra_id: "o1", texto: "oi" });
  });

  it("o fluxo passa pedaço a pedaço: o primeiro evento chega antes de o agente terminar", async () => {
    const enc = new TextEncoder();
    let fechar!: () => void;
    criarRede({
      "POST /conversa": () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(c) {
              c.enqueue(enc.encode('event: texto\ndata: {"delta":"um"}\n\n'));
              fechar = () => {
                c.enqueue(enc.encode('event: fim\ndata: {}\n\n'));
                c.close();
              };
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        ),
    });
    const r = await POST(pedido({ authorization: "Bearer a" }));
    const leitor = r.body!.getReader();
    const dec = new TextDecoder();
    // se o repasse esperasse o fim, esta leitura nunca voltaria: o agente ainda não fechou o fluxo
    const primeiro = await leitor.read();
    expect(dec.decode(primeiro.value)).toContain('"delta":"um"');
    fechar();
    let resto = "";
    for (let p = await leitor.read(); !p.done; p = await leitor.read()) resto += dec.decode(p.value);
    expect(resto).toContain("event: fim");
  });

  it.each([502, 503, 504])("agente fora do ar (%i) vira 503 com mensagem clara", async (status) => {
    criarRede({ "POST /conversa": () => json({ detail: "x" }, status) });
    const r = await POST(pedido({ authorization: "Bearer a" }));
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ detail: "O agente ainda não está ligado nesta instalação." });
  });

  it("rede caindo também vira 503", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    expect((await POST(pedido({ authorization: "Bearer a" }))).status).toBe(503);
  });

  it("erro do agente (402 sem créditos) passa como veio", async () => {
    criarRede({ "POST /conversa": () => json({ mensagem: "Créditos esgotados." }, 402) });
    const r = await POST(pedido({ authorization: "Bearer a" }));
    expect(r.status).toBe(402);
    expect(await r.json()).toEqual({ mensagem: "Créditos esgotados." });
  });

  it("modo de demonstração: sem acesso válido, 401 e nenhuma rede", async () => {
    vi.stubEnv("CANTEIRO_DEMO", "1");
    const rede = criarRede({});
    expect((await POST(pedido({ authorization: "Bearer inventado" }))).status).toBe(401);
    expect(rede.fetch).not.toHaveBeenCalled();
  });
});
