import { describe, expect, it } from "vitest";
import { caminhoPermitido, headersDeRepasse, origemConfiavel, segundosAteVencer } from "./repasse";

describe("repasse para a API", () => {
  it("só deixa passar rotas de dados do contrato, sem truque de caminho", () => {
    expect(caminhoPermitido(["obras", "o1", "insumos"])).toBe(true);
    expect(caminhoPermitido(["sessoes", "s1", "mensagens"])).toBe(true);
    expect(caminhoPermitido(["propostas", "p1", "aprovar"])).toBe(true);
    expect(caminhoPermitido(["auth", "entrar"])).toBe(false);
    expect(caminhoPermitido(["obras", "resumo"])).toBe(true);
    expect(caminhoPermitido(["foo"])).toBe(false);
    expect(caminhoPermitido(["obras", ".."])).toBe(false);
    expect(caminhoPermitido(["obras", "a/b"])).toBe(false);
    expect(caminhoPermitido([])).toBe(false);
  });

  it("conta e consumo só de leitura; PUT/DELETE só na chave própria", () => {
    for (const r of [["conta"], ["conta", "chave-anthropic"], ["uso"], ["creditos"], ["obras", "resumo"]]) expect(caminhoPermitido(r, "GET")).toBe(true);
    expect(caminhoPermitido(["conta", "chave-anthropic"], "PUT")).toBe(true);
    expect(caminhoPermitido(["conta", "chave-anthropic"], "DELETE")).toBe(true);
    expect(caminhoPermitido(["conta"], "POST")).toBe(false);
    expect(caminhoPermitido(["conta"], "PUT")).toBe(false);
    expect(caminhoPermitido(["uso"], "POST")).toBe(false);
    expect(caminhoPermitido(["conta", "outra"], "GET")).toBe(false);
    expect(caminhoPermitido(["obras", "o1"], "DELETE")).toBe(false);
    expect(caminhoPermitido(["propostas", "p1"], "PUT")).toBe(false);
    expect(caminhoPermitido(["conta", "chave-anthropic"], "PATCH")).toBe(false);
  });

  it("cookie de renovação só com o header próprio e da mesma origem", () => {
    const req = (h: Record<string, string>) => new Request("http://localhost:3000/srv/auth/renovar", { method: "POST", headers: h });
    expect(origemConfiavel(req({ host: "localhost:3000" }))).toBe(false);
    expect(origemConfiavel(req({ "x-canteiro": "1", host: "localhost:3000", origin: "http://localhost:3000" }))).toBe(true);
    expect(origemConfiavel(req({ "x-canteiro": "1", host: "localhost:3000", origin: "https://mal.example" }))).toBe(false);
  });

  it("lê o exp do JWT só para agendar a renovação", () => {
    const exp = Math.floor(Date.now() / 1000) + 600;
    const jwt = `x.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.y`;
    expect(segundosAteVencer(jwt)).toBeGreaterThan(590);
    expect(segundosAteVencer("opaco")).toBe(900);
  });
});

describe("headers para a API", () => {
  it("leva Authorization e X-Forwarded-For (limite por IP no login), nunca o cookie", () => {
    const req = new Request("http://localhost/srv/auth/entrar", {
      headers: { authorization: "Bearer a", cookie: "canteiro_renovacao=segredo", "x-forwarded-for": "200.1.2.3", "content-type": "application/json" },
    });
    const h = headersDeRepasse(req);
    expect(h.get("authorization")).toBe("Bearer a");
    expect(h.get("x-forwarded-for")).toBe("200.1.2.3");
    expect(h.get("cookie")).toBeNull();
  });

  it("com PROXY_SEGREDO, manda o segredo e o IP do visitante (Vercel)", () => {
    const antes = process.env.PROXY_SEGREDO;
    process.env.PROXY_SEGREDO = "s3gredo";
    try {
      const req = new Request("http://x/srv/api/obras", { headers: { "x-real-ip": "200.1.2.3", "x-forwarded-for": "200.1.2.3, 76.76.21.9" } });
      const h = headersDeRepasse(req);
      expect(h.get("x-canteiro-proxy")).toBe("s3gredo");
      expect(h.get("x-canteiro-ip-cliente")).toBe("200.1.2.3");
    } finally {
      if (antes === undefined) delete process.env.PROXY_SEGREDO; else process.env.PROXY_SEGREDO = antes;
    }
  });

  it("sem PROXY_SEGREDO, não manda cabeçalho de proxy", () => {
    const h = headersDeRepasse(new Request("http://x/", { headers: { "x-real-ip": "200.1.2.3" } }));
    expect(h.get("x-canteiro-proxy")).toBeNull();
  });
});
