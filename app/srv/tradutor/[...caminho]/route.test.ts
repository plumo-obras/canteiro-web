// @vitest-environment node
/**
 * O repasse /srv/tradutor/* é quem barra o tradutor de pranchas (que não conhece usuário): só passa sessão válida,
 * só as rotas de leitura do contrato e a chave do serviço é posta aqui, sem nunca voltar ao navegador.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarRede, json } from "@/testes/rede";
import { DELETE, GET, POST, caminhoTradutor } from "./route";
import { entrarDemo } from "@/lib/demo/loja";

const ID = "0123456789abcdef0123456789abcdef";

function chamar(metodo: "GET" | "POST" | "DELETE", caminho: string[], headers: Record<string, string> = { authorization: "Bearer t" }) {
  const req = new Request(`http://localhost:3000/srv/tradutor/${caminho.join("/")}`, {
    method: metodo,
    headers,
    body: metodo === "POST" ? "conteudo" : undefined,
  });
  return ({ GET, POST, DELETE }[metodo])(req, { params: Promise.resolve({ caminho }) });
}

beforeEach(() => {
  vi.stubEnv("CANTEIRO_DEMO", "");
  vi.stubEnv("API_URL", "http://api.teste");
  vi.stubEnv("TRADUTOR_URL", "http://tradutor.teste/");
  vi.stubEnv("TRADUTOR_CHAVE", "chave-secreta");
  vi.stubEnv("PROXY_SEGREDO", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("/srv/tradutor/* — caminhos", () => {
  it.each([
    [["traducoes"], "POST", true],
    [["traducoes", ID], "GET", true],
    [["traducoes", ID, "resultado"], "GET", true],
    [["traducoes", ID, "modelo3d"], "GET", true],
    [["traducoes", ID, "excel"], "GET", false],
    [["traducoes", ID], "POST", false],
    [["traducoes", "../saude"], "GET", false],
    [["traducoes", "abc"], "GET", false],
    [["saude"], "GET", false],
    [["traducoes"], "GET", false],
    [["traducoes", ID], "DELETE", true],
    [["traducoes"], "DELETE", false],
    [["traducoes", ID, "resultado"], "DELETE", false],
    [["traducoes", "abc"], "DELETE", false],
    [["projetos"], "DELETE", false],
  ])("%j %s -> %s", (seg, metodo, ok) => {
    expect(caminhoTradutor(seg as string[], metodo as string)).toBe(ok);
  });

  it.each([
    [`?ids=${ID}`, true],
    [`?ids=${ID},${ID.replace("0", "1")}`, true],
    [`?ids=${ID},${ID}`, false],
    ["?ids=", false],
    ["?ids=../x", false],
    ["", false],
  ])("projetos%s -> %s", (busca, ok) => {
    expect(caminhoTradutor(["projetos"], "GET", busca)).toBe(ok);
  });

  it("libera os materiais do projeto com ids válidos e UF de duas letras", () => {
    expect(caminhoTradutor(["projetos", "materiais"], "GET", `?ids=${ID}&uf=SP`)).toBe(true);
    expect(caminhoTradutor(["projetos", "materiais"], "GET", `?ids=${ID}`)).toBe(true);
    expect(caminhoTradutor(["projetos", "materiais"], "GET", `?ids=${ID}&uf=SAO`)).toBe(false);
    expect(caminhoTradutor(["projetos", "materiais"], "GET", "?ids=../x&uf=SP")).toBe(false);
    expect(caminhoTradutor(["projetos", "materiais"], "POST", `?ids=${ID}&uf=SP`)).toBe(false);
  });

  it("libera só o espelho .dxf dentro de projetos", () => {
    expect(caminhoTradutor(["projetos", "espelho.dxf"], "GET", `?ids=${ID}`)).toBe(true);
    expect(caminhoTradutor(["projetos", "espelho.dxf"], "POST", `?ids=${ID}`)).toBe(false);
    expect(caminhoTradutor(["projetos", "outro.dxf"], "GET", `?ids=${ID}`)).toBe(false);
  });

  it("recusa rota fora do contrato sem chamar ninguém", async () => {
    const rede = criarRede({});
    expect((await chamar("GET", ["traducoes", ID, "excel"])).status).toBe(404);
    expect(rede.fetch).not.toHaveBeenCalled();
  });
});

describe("/srv/tradutor/* — sessão e chave", () => {
  it("sem TRADUTOR_URL avisa que não está ligado", async () => {
    vi.stubEnv("TRADUTOR_URL", "");
    const rede = criarRede({});
    const r = await chamar("GET", ["traducoes", ID]);
    expect(r.status).toBe(503);
    expect(rede.fetch).not.toHaveBeenCalled();
  });

  it("sem sessão válida na API não chega ao tradutor", async () => {
    const rede = criarRede({ "GET /conta": () => json({ detail: "expirada" }, 401) });
    const r = await chamar("GET", ["traducoes", ID]);
    expect(r.status).toBe(401);
    expect(rede.chamadas.map((c) => c.url.host)).toEqual(["api.teste"]);
  });

  it("com sessão, repassa com a chave do serviço e o POST espera um pouco pelo PDF", async () => {
    const rede = criarRede({
      "GET /conta": () => json({ id: "u1" }),
      "POST /v1/traducoes": () => json({ id: ID, status: "processando" }, 202),
    });
    const r = await chamar("POST", ["traducoes"], { authorization: "Bearer t", "content-type": "multipart/form-data; boundary=x" });
    expect(r.status).toBe(202);
    const ida = rede.chamadas.find((c) => c.url.host === "tradutor.teste")!;
    expect(ida.url.search).toBe("?aguardar=25");
    const h = new Headers(ida.init.headers);
    expect(h.get("x-api-key")).toBe("chave-secreta");
    expect(h.get("authorization")).toBeNull(); // o token do usuário não vai para o tradutor
    expect(h.get("content-type")).toContain("boundary=x");
  });

  it("apagar uma leitura repassa o DELETE com a chave e devolve o 204", async () => {
    const rede = criarRede({
      "GET /conta": () => json({ id: "u1" }),
      [`DELETE /v1/traducoes/${ID}`]: () => new Response(null, { status: 204 }),
    });
    const r = await chamar("DELETE", ["traducoes", ID], { authorization: "Bearer t" });
    expect(r.status).toBe(204);
    const ida = rede.chamadas.find((c) => c.url.host === "tradutor.teste")!;
    expect(ida.metodo).toBe("DELETE");
    expect(new Headers(ida.init.headers).get("x-api-key")).toBe("chave-secreta");
  });

  it("tradutor fora do ar vira 502 com mensagem para a pessoa", async () => {
    criarRede({ "GET /conta": () => json({ id: "u1" }) });
    const f = globalThis.fetch as ReturnType<typeof vi.fn>;
    const original = f.getMockImplementation() as (u: string | URL | Request, i?: RequestInit) => Promise<Response>;
    f.mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).startsWith("http://tradutor.teste")) throw new TypeError("fetch failed");
      return original(url, init);
    });
    const r = await chamar("GET", ["traducoes", ID]);
    expect(r.status).toBe(502);
  });
});

describe("/srv/tradutor/* — demonstração sem tradutor (projeto fictício, SIMULADO)", () => {
  const FOLHA_DEMO = "d0e0f0010001";
  const acessoDemo = () => {
    const r = entrarDemo("admin@exemplo.com", "qualquer")!;
    return { authorization: `Bearer ${r.acesso}` };
  };
  beforeEach(() => {
    vi.stubEnv("CANTEIRO_DEMO", "1");
    vi.stubEnv("TRADUTOR_URL", "");
  });

  it("sem sessão da demo, 401", async () => {
    const r = await chamar("POST", ["traducoes"], {});
    expect(r.status).toBe(401);
  });

  it("projeto e materiais fictícios só para as folhas da demo, sem tocar a rede", async () => {
    const rede = criarRede({});
    const req = (busca: string, caminho: string[]) =>
      GET(new Request(`http://localhost:3000/srv/tradutor/${caminho.join("/")}${busca}`, { headers: acessoDemo() }), { params: Promise.resolve({ caminho }) });
    const p = await (await req(`?ids=${FOLHA_DEMO}`, ["projetos"])).json();
    expect(p.modelo3d?.elementos.length).toBeGreaterThan(0);
    const estranho = await (await req(`?ids=${ID}`, ["projetos"])).json();
    expect(estranho.modelo3d).toBeNull();
    expect(estranho.nao_encontradas).toEqual([ID]);
    expect((await req(`?ids=${FOLHA_DEMO}&uf=SP`, ["projetos", "materiais"])).status).toBe(200);
    expect(rede.chamadas).toEqual([]);
  });

  it("enviar e apagar não fingem que deu certo: 503 com o motivo", async () => {
    for (const [metodo, caminho] of [["POST", ["traducoes"]], ["DELETE", ["traducoes", ID]]] as const) {
      const r = await chamar(metodo, [...caminho], acessoDemo());
      expect(r.status).toBe(503);
      expect((await r.json()).detail).toMatch(/fictício/);
    }
  });

  it("com TRADUTOR_URL ligado, a demonstração repassa ao tradutor de verdade", async () => {
    vi.stubEnv("TRADUTOR_URL", "http://tradutor.teste/");
    const rede = criarRede({ "GET /v1/projetos": () => json({ ok: true }) });
    const req = new Request(`http://localhost:3000/srv/tradutor/projetos?ids=${ID}`, { headers: acessoDemo() });
    const r = await GET(req, { params: Promise.resolve({ caminho: ["projetos"] }) });
    expect(r.status).toBe(200);
    expect(rede.chamadas.some((c) => c.url.host === "tradutor.teste")).toBe(true);
  });
});
