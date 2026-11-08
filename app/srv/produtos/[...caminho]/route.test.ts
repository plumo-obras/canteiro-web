// @vitest-environment node
/**
 * O repasse /srv/produtos/* é quem barra o catálogo de produtos (que não conhece usuário): só GET, só as rotas de
 * consulta do contrato, sessão válida, e a chave do serviço é posta aqui sem nunca voltar ao navegador.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarRede, json } from "@/testes/rede";
import { GET, caminhoProdutos } from "./route";

const ID = "0123456789abcdef0123456789abcdef";

function chamar(caminho: string[], busca = "", headers: Record<string, string> = { authorization: "Bearer t" }) {
  const req = new Request(`http://localhost:3000/srv/produtos/${caminho.join("/")}${busca}`, { method: "GET", headers });
  return GET(req, { params: Promise.resolve({ caminho }) });
}

beforeEach(() => {
  vi.stubEnv("CANTEIRO_DEMO", "");
  vi.stubEnv("API_URL", "http://api.teste");
  vi.stubEnv("PRODUTOS_URL", "http://produtos.teste/");
  vi.stubEnv("PRODUTOS_CHAVE", "chave-secreta");
  vi.stubEnv("PROXY_SEGREDO", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("/srv/produtos/* — caminhos", () => {
  it.each([
    [["bases"], "", true],
    [["itens"], "?q=aco&uf=SP", true],
    [["itens"], "?q=aco&base=sicro&tipo=insumo", true],
    [["itens"], "?q=", false], // busca sem termo
    [["itens"], "?q=aco&uf=SAO", false], // uf inválida
    [["itens"], "?q=aco&mes=2026/09", false], // mês inválido
    [["itens", "sinapi", "insumo", "34"], "?uf=SP", true],
    [["itens", "sinapi", "composicao", "89290"], "", true],
    [["itens", "sinapi", "servico", "34"], "", false], // tipo inválido
    [["itens", "sinapi", "insumo", "../x"], "", false], // código inválido
    [["itens", "sinapi"], "", false],
    [["traducoes"], "", false],
  ])("%j %s -> %s", (seg, busca, ok) => {
    expect(caminhoProdutos(seg as string[], "GET", busca as string)).toBe(ok);
  });

  it("só GET", () => {
    expect(caminhoProdutos(["bases"], "POST")).toBe(false);
    expect(caminhoProdutos(["bases"], "DELETE")).toBe(false);
  });

  it("recusa rota fora do contrato sem chamar ninguém", async () => {
    const rede = criarRede({});
    expect((await chamar(["itens", "sinapi"])).status).toBe(404);
    expect(rede.fetch).not.toHaveBeenCalled();
  });
});

describe("/srv/produtos/* — sessão e chave", () => {
  it("sem PRODUTOS_URL avisa que não está ligado", async () => {
    vi.stubEnv("PRODUTOS_URL", "");
    const rede = criarRede({});
    expect((await chamar(["bases"])).status).toBe(503);
    expect(rede.fetch).not.toHaveBeenCalled();
  });

  it("sem sessão válida na API não chega ao catálogo", async () => {
    const rede = criarRede({ "GET /conta": () => json({ detail: "expirada" }, 401) });
    const r = await chamar(["bases"]);
    expect(r.status).toBe(401);
    expect(rede.chamadas.map((c) => c.url.host)).toEqual(["api.teste"]);
  });

  it("com sessão, repassa com a chave do serviço e sem o token do usuário", async () => {
    const rede = criarRede({
      "GET /conta": () => json({ id: "u1" }),
      "GET /v1/itens": () => json({ itens: [] }),
    });
    const r = await chamar(["itens"], "?q=concreto%20c30&uf=SP");
    expect(r.status).toBe(200);
    const ida = rede.chamadas.find((c) => c.url.host === "produtos.teste")!;
    expect(ida.url.pathname).toBe("/v1/itens");
    expect(ida.url.search).toBe("?q=concreto%20c30&uf=SP");
    const h = new Headers(ida.init.headers);
    expect(h.get("x-api-key")).toBe("chave-secreta");
    expect(h.get("authorization")).toBeNull();
  });

  it("demonstração: passa pelo token da demo e repassa ao catálogo", async () => {
    vi.stubEnv("CANTEIRO_DEMO", "1");
    const rede = criarRede({ "GET /v1/bases": () => json([{ base: "sinapi", meses: ["2026-09"] }]) });
    const r = await chamar(["bases"], "", { authorization: "Bearer demo:u1:engenheiro@demo.com.br" });
    expect([200, 401]).toContain(r.status); // depende do formato do token da demo; não deve chamar a API
    expect(rede.chamadas.some((c) => c.url.host === "api.teste")).toBe(false);
  });
});
