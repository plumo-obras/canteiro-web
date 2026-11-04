// @vitest-environment node
/**
 * O repasse /srv/api/* é o que separa o navegador da API: só rotas e métodos do contrato passam, o cookie de renovação
 * nunca vai junto, o segredo do proxy é posto aqui (o navegador não o conhece) e redirecionamento da API não é seguido.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarRede, json } from "@/testes/rede";
import { DELETE, GET, PATCH, POST, PUT } from "./route";

const HANDLERS = { GET, POST, PUT, PATCH, DELETE } as const;
type Metodo = keyof typeof HANDLERS;

function chamar(metodo: Metodo, caminho: string[], opcoes: { query?: string; headers?: Record<string, string>; corpo?: unknown } = {}) {
  const req = new Request(`http://localhost:3000/srv/api/${caminho.join("/")}${opcoes.query ?? ""}`, {
    method: metodo,
    headers: { "content-type": "application/json", ...opcoes.headers },
    body: opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
  });
  return HANDLERS[metodo](req, { params: Promise.resolve({ caminho }) });
}

beforeEach(() => {
  vi.stubEnv("CANTEIRO_DEMO", "");
  vi.stubEnv("API_URL", "http://api.teste");
  vi.stubEnv("PROXY_SEGREDO", "");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("CONFIAR_XFF", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("/srv/api/* — lista de caminhos", () => {
  it.each([
    [["obras", ".."]],
    [["obras", "."]],
    [["..", "auth", "entrar"]],
    [["obras", "a/b"]],
    [["obras", "a\\b"]],
    [["obras", "o1?admin=1"]],
    [["obras", "o1#x"]],
    [["obras", ""]],
    [["auth", "entrar"]],
    [["interno", "x"]],
  ])("recusa %j com 404 sem chamar a API", async (caminho) => {
    const rede = criarRede({});
    const r = await chamar("GET", caminho);
    expect(r.status).toBe(404);
    expect(rede.fetch).not.toHaveBeenCalled();
  });

  it("barra codificada segue como texto (%252F), nunca vira separador de caminho na API", async () => {
    const rede = criarRede({ "GET /obras/a%252F..%252Fauth": () => json({}) });
    await chamar("GET", ["obras", "a%2F..%2Fauth"]);
    expect(rede.chamadas[0]!.caminho).toBe("/obras/a%252F..%252Fauth");
  });

  it.each<[Metodo, string[]]>([
    ["DELETE", ["obras", "o1"]],
    ["PUT", ["propostas", "p1"]],
    ["PATCH", ["conta", "chave-anthropic"]],
    ["POST", ["conta"]],
    ["POST", ["uso"]],
  ])("método fora do contrato: %s %j → 404", async (metodo, caminho) => {
    const rede = criarRede({});
    const r = await chamar(metodo, caminho, { corpo: metodo === "DELETE" ? undefined : {} });
    expect(r.status).toBe(404);
    expect(rede.fetch).not.toHaveBeenCalled();
  });
});

describe("/srv/api/* — repasse", () => {
  it("leva caminho, query, corpo e Authorization; o cookie de renovação fica no Next", async () => {
    const rede = criarRede({ "PATCH /obras/o1": () => json({ id: "o1" }) });
    const r = await chamar("PATCH", ["obras", "o1"], {
      query: "?x=1",
      corpo: { nome: "Casa" },
      headers: { authorization: "Bearer acesso-1", cookie: "canteiro_renovacao=segredo-do-cookie" },
    });
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    const c = rede.chamadas[0]!;
    expect(c.metodo).toBe("PATCH");
    expect(c.url.href).toBe("http://api.teste/obras/o1?x=1");
    const h = new Headers(c.init.headers);
    expect(h.get("authorization")).toBe("Bearer acesso-1");
    expect(h.get("cookie")).toBeNull();
    expect(JSON.stringify([...h])).not.toContain("segredo-do-cookie");
    expect(new TextDecoder().decode(c.init.body as ArrayBuffer)).toBe('{"nome":"Casa"}');
  });

  it("PROXY_SEGREDO é posto pelo servidor, e um x-canteiro-proxy vindo do navegador não passa", async () => {
    vi.stubEnv("PROXY_SEGREDO", "s3gredo");
    const rede = criarRede({ "GET /obras": () => json([]) });
    await chamar("GET", ["obras"], { headers: { "x-canteiro-proxy": "forjado" } });
    expect(new Headers(rede.chamadas[0]!.init.headers).get("x-canteiro-proxy")).toBe("s3gredo");
  });

  it("sem PROXY_SEGREDO, o x-canteiro-proxy do navegador também não passa", async () => {
    const rede = criarRede({ "GET /obras": () => json([]) });
    await chamar("GET", ["obras"], { headers: { "x-canteiro-proxy": "forjado" } });
    expect(new Headers(rede.chamadas[0]!.init.headers).get("x-canteiro-proxy")).toBeNull();
  });

  it("redirecionamento da API não é seguido: volta como veio, numa chamada só", async () => {
    const rede = criarRede({
      "GET /obras": () => new Response(null, { status: 302, headers: { location: "http://interno.exemplo/segredo" } }),
    });
    const r = await chamar("GET", ["obras"]);
    expect(rede.chamadas).toHaveLength(1);
    expect(rede.chamadas[0]!.init.redirect).toBe("manual");
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBeNull();
  });

  it("status de erro da API passa adiante", async () => {
    criarRede({ "GET /obras/o9": () => json({ detail: "Não encontrada." }, 404) });
    const r = await chamar("GET", ["obras", "o9"]);
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ detail: "Não encontrada." });
  });
});

describe("/srv/api/* — modo de demonstração", () => {
  it("responde sem rede; sem acesso válido, 401", async () => {
    vi.stubEnv("CANTEIRO_DEMO", "1");
    const rede = criarRede({});
    const r = await chamar("GET", ["obras"], { headers: { authorization: "Bearer inventado" } });
    expect(r.status).toBe(401);
    expect(rede.fetch).not.toHaveBeenCalled();
  });
});
