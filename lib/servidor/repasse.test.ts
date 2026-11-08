import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    expect(caminhoPermitido(["obras", "o1", "cronograma"], "PUT")).toBe(true); // Fase 4
    expect(caminhoPermitido(["obras", "o1", "cronograma"], "DELETE")).toBe(false);
    // desembolso: só leitura (um POST passa pelo prefixo de obras e a API responde 405)
    expect(caminhoPermitido(["obras", "o1", "desembolso"], "GET")).toBe(true);
    for (const m of ["PUT", "PATCH", "DELETE"]) expect(caminhoPermitido(["obras", "o1", "desembolso"], m)).toBe(false);
    expect(caminhoPermitido(["obras", "o1", "desembolso", "x"], "PUT")).toBe(false);
    expect(caminhoPermitido(["obras", "o1", "insumos"], "PUT")).toBe(false);
    expect(caminhoPermitido(["conta", "chave-anthropic"], "PATCH")).toBe(false);
    expect(caminhoPermitido(["obras", "o1"], "PATCH")).toBe(true);
    // gastos: comprovante (envio, arquivo, confirmar), etapas extras e tópicos; a leitura interna é só do agente
    expect(caminhoPermitido(["comprovantes", "c1", "arquivo"], "GET")).toBe(true);
    expect(caminhoPermitido(["comprovantes", "c1", "confirmar"], "POST")).toBe(true);
    expect(caminhoPermitido(["topicos", "t1"], "PATCH")).toBe(true);
    expect(caminhoPermitido(["etapas-extras", "e1"], "PATCH")).toBe(true);
    expect(caminhoPermitido(["interno", "comprovantes", "c1", "leitura"], "PUT")).toBe(false);
    expect(caminhoPermitido(["comprovantes", "c1"], "PATCH")).toBe(false);
    // mudar a etapa de um gasto: só o PATCH no próprio gasto; o resto de /gastos não passa
    expect(caminhoPermitido(["gastos", "g1"], "PATCH")).toBe(true);
    expect(caminhoPermitido(["gastos", "g1"], "GET")).toBe(false);
    expect(caminhoPermitido(["gastos", "g1"], "POST")).toBe(false);
    expect(caminhoPermitido(["gastos", "g1"], "DELETE")).toBe(false);
    expect(caminhoPermitido(["gastos", "g1", "estornar"], "PATCH")).toBe(false);
    expect(caminhoPermitido(["gastos"], "PATCH")).toBe(false);
    // tributos: a leitura pela obra e a natureza fiscal do gasto, só por PATCH
    expect(caminhoPermitido(["obras", "o1", "tributos"], "GET")).toBe(true);
    expect(caminhoPermitido(["gastos", "g1", "fiscal"], "PATCH")).toBe(true);
    expect(caminhoPermitido(["gastos", "g1", "fiscal"], "GET")).toBe(false);
    expect(caminhoPermitido(["gastos", "g1", "fiscal"], "POST")).toBe(false);
    expect(caminhoPermitido(["gastos", "g1", "fiscal"], "PUT")).toBe(false);
    expect(caminhoPermitido(["gastos", "g1", "fiscal", "x"], "PATCH")).toBe(false);
    expect(caminhoPermitido(["pedidos", "p1", "fiscal"], "PATCH")).toBe(false);
    expect(caminhoPermitido(["obras", "o1", "insumos"], "PATCH")).toBe(false);
    expect(caminhoPermitido(["pedidos", "p1"], "PATCH")).toBe(true); // previsão e observação (Fase 2)
    expect(caminhoPermitido(["fornecedores", "f1"], "PATCH")).toBe(true);
    expect(caminhoPermitido(["pedidos", "p1", "recebimentos"], "PATCH")).toBe(false);
    expect(caminhoPermitido(["fornecedores"], "GET")).toBe(true);
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
  // Cada teste diz em que ambiente está: VERCEL e CONFIAR_XFF decidem se o X-Forwarded-For de entrada é confiável.
  beforeEach(() => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("CONFIAR_XFF", "");
    vi.stubEnv("PROXY_SEGREDO", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  const pedido = (h: Record<string, string>) => new Request("http://localhost/srv/auth/entrar", { method: "POST", headers: h });

  it("leva Authorization e X-Forwarded-For (limite por IP no login), nunca o cookie", () => {
    vi.stubEnv("CONFIAR_XFF", "1");
    const h = headersDeRepasse(
      pedido({ authorization: "Bearer a", cookie: "canteiro_renovacao=segredo", "x-forwarded-for": "200.1.2.3", "content-type": "application/json" }),
    );
    expect(h.get("authorization")).toBe("Bearer a");
    expect(h.get("x-forwarded-for")).toBe("200.1.2.3");
    expect(h.get("cookie")).toBeNull();
  });

  it("fora da Vercel e sem CONFIAR_XFF, ignora o X-Forwarded-For do visitante (seria forjável)", () => {
    vi.stubEnv("PROXY_SEGREDO", "s3gredo");
    const h = headersDeRepasse(pedido({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "1.2.3.4" }));
    expect(h.get("x-forwarded-for")).toBeNull();
    expect(h.get("x-canteiro-ip-cliente")).toBeNull();
    // o segredo continua indo: ele identifica o Next, não o visitante
    expect(h.get("x-canteiro-proxy")).toBe("s3gredo");
  });

  it("com CONFIAR_XFF=1 (proxy de confiança na frente), repassa o IP", () => {
    vi.stubEnv("CONFIAR_XFF", "1");
    vi.stubEnv("PROXY_SEGREDO", "s3gredo");
    const h = headersDeRepasse(pedido({ "x-forwarded-for": "200.1.2.3, 10.0.0.1" }));
    expect(h.get("x-forwarded-for")).toBe("200.1.2.3, 10.0.0.1");
    expect(h.get("x-canteiro-ip-cliente")).toBe("200.1.2.3");
  });

  it("na Vercel, manda o segredo e o IP do visitante sem precisar de CONFIAR_XFF", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("PROXY_SEGREDO", "s3gredo");
    const h = headersDeRepasse(pedido({ "x-real-ip": "200.1.2.3", "x-forwarded-for": "200.1.2.3, 76.76.21.9" }));
    expect(h.get("x-canteiro-proxy")).toBe("s3gredo");
    expect(h.get("x-canteiro-ip-cliente")).toBe("200.1.2.3");
    expect(h.get("x-forwarded-for")).toBe("200.1.2.3, 76.76.21.9");
  });

  it("sem PROXY_SEGREDO, não manda cabeçalho de proxy", () => {
    vi.stubEnv("VERCEL", "1");
    const h = headersDeRepasse(pedido({ "x-real-ip": "200.1.2.3" }));
    expect(h.get("x-canteiro-proxy")).toBeNull();
    expect(h.get("x-canteiro-ip-cliente")).toBeNull();
  });
});
