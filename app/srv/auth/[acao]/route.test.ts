// @vitest-environment node
/**
 * A rota do login é a única que toca o cookie de renovação: aqui se prova que ele nasce trancado (httpOnly, Strict, só
 * em /srv/auth) e que só a recusa da API o apaga — falha de rede ou 5xx não pode derrubar a sessão de ninguém.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarRede, json, USUARIO } from "@/testes/rede";

interface OpcoesCookie {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
  path?: string;
  maxAge?: number;
}

// Pote de cookies falso no lugar do next/headers: guarda valor e opções de cada set para os testes conferirem.
const pote = vi.hoisted(() => {
  const valores = new Map<string, string>();
  return {
    valores,
    set: vi.fn((nome: string, valor: string, _opcoes?: OpcoesCookie) => void valores.set(nome, valor)),
    delete: vi.fn((alvo: string | { name: string; path?: string }) => void valores.delete(typeof alvo === "string" ? alvo : alvo.name)),
    get: (nome: string) => (valores.has(nome) ? { name: nome, value: valores.get(nome)! } : undefined),
  };
});
vi.mock("next/headers", () => ({ cookies: async () => pote }));

const COOKIE = "canteiro_renovacao";

type Rota = typeof import("./route").POST;
let POST: Rota;
/** Importa a rota de novo: as opções do cookie leem NODE_ENV ao carregar o módulo. */
async function carregar() {
  vi.resetModules();
  POST = (await import("./route")).POST;
}

const pedido = (acao: string, corpo?: unknown, headers: Record<string, string> = { "x-canteiro": "1" }) =>
  new Request(`http://localhost:3000/srv/auth/${acao}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });

const chamar = async (acao: string, corpo?: unknown, headers?: Record<string, string>) =>
  POST(pedido(acao, corpo, headers), { params: Promise.resolve({ acao }) });

const RESPOSTA_ENTRAR = { acesso: "acesso-1", renovacao: "renovacao-api", usuario: USUARIO };

beforeEach(async () => {
  pote.valores.clear();
  pote.set.mockClear();
  pote.delete.mockClear();
  vi.stubEnv("CANTEIRO_DEMO", "");
  vi.stubEnv("API_URL", "http://api.teste");
  await carregar();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /srv/auth/* — proteção", () => {
  it("sem o header x-canteiro, recusa com 403 antes de qualquer coisa", async () => {
    const rede = criarRede({});
    pote.valores.set(COOKIE, "r-1");
    for (const acao of ["entrar", "renovar", "sair"]) {
      const r = await chamar(acao, { email: "a@b", senha: "x" }, {});
      expect(r.status).toBe(403);
    }
    expect(rede.fetch).not.toHaveBeenCalled();
    expect(pote.delete).not.toHaveBeenCalled();
    expect(pote.valores.get(COOKIE)).toBe("r-1");
  });

  it("origem de outro site também é 403", async () => {
    criarRede({});
    const r = await chamar("renovar", undefined, { "x-canteiro": "1", host: "localhost:3000", origin: "https://mal.example" });
    expect(r.status).toBe(403);
  });

  it("ação desconhecida é 404", async () => {
    criarRede({});
    expect((await chamar("qualquer")).status).toBe(404);
  });
});

describe("POST /srv/auth/* — repasse para a API", () => {
  it("entrar: guarda a renovação em cookie trancado e devolve só o acesso ao navegador", async () => {
    const rede = criarRede({ "POST /auth/entrar": () => json(RESPOSTA_ENTRAR) });
    const r = await chamar("entrar", { email: "a@b.com", senha: "s" });
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as Record<string, unknown>;
    expect(corpo).toMatchObject({ acesso: "acesso-1", usuario: USUARIO });
    expect(corpo).not.toHaveProperty("renovacao");
    expect(JSON.stringify(corpo)).not.toContain("renovacao-api");

    expect(rede.chamadas[0]!.corpo).toEqual({ email: "a@b.com", senha: "s" });
    expect(pote.set).toHaveBeenCalledTimes(1);
    const [nome, valor, opcoes] = pote.set.mock.calls[0]!;
    expect(nome).toBe(COOKIE);
    expect(valor).toBe("renovacao-api");
    expect(opcoes).toMatchObject({ httpOnly: true, sameSite: "strict", path: "/srv/auth", secure: false });
  });

  it("entrar em produção: o cookie também é secure", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await carregar();
    criarRede({ "POST /auth/entrar": () => json(RESPOSTA_ENTRAR) });
    await chamar("entrar", { email: "a@b.com", senha: "s" });
    expect(pote.set.mock.calls[0]![2]).toMatchObject({ httpOnly: true, secure: true, sameSite: "strict", path: "/srv/auth" });
  });

  it("entrar recusado: repassa o status da API e não grava cookie", async () => {
    criarRede({ "POST /auth/entrar": () => json({ detail: "E-mail ou senha incorretos." }, 401) });
    const r = await chamar("entrar", { email: "a@b.com", senha: "errada" });
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ detail: "E-mail ou senha incorretos." });
    expect(pote.set).not.toHaveBeenCalled();
  });

  it("renovar sem cookie: 401 sem chamar a API", async () => {
    const rede = criarRede({});
    expect((await chamar("renovar")).status).toBe(401);
    expect(rede.fetch).not.toHaveBeenCalled();
  });

  it("renovar OK: troca o cookie pela renovação nova", async () => {
    pote.valores.set(COOKIE, "r-velha");
    const rede = criarRede({ "POST /auth/renovar": () => json({ ...RESPOSTA_ENTRAR, renovacao: "r-nova" }) });
    const r = await chamar("renovar");
    expect(r.status).toBe(200);
    expect(rede.chamadas[0]!.corpo).toEqual({ renovacao: "r-velha" });
    expect(pote.valores.get(COOKIE)).toBe("r-nova");
  });

  it.each([401, 403])("renovar recusado pela API (%i): apaga o cookie e responde 401", async (status) => {
    pote.valores.set(COOKIE, "r-1");
    criarRede({ "POST /auth/renovar": () => json({ detail: "não" }, status) });
    const r = await chamar("renovar");
    expect(r.status).toBe(401);
    expect(pote.delete).toHaveBeenCalledWith({ name: COOKIE, path: "/srv/auth" });
    expect(pote.valores.has(COOKIE)).toBe(false);
  });

  it.each([500, 502, 503])("renovar com a API em erro (%i): 503 e o cookie FICA", async (status) => {
    pote.valores.set(COOKIE, "r-1");
    criarRede({ "POST /auth/renovar": () => json({ detail: "fora" }, status) });
    const r = await chamar("renovar");
    expect(r.status).toBe(503);
    expect(pote.delete).not.toHaveBeenCalled();
    expect(pote.valores.get(COOKIE)).toBe("r-1");
  });

  it("renovar com a rede caindo (fetch lança): 503 e o cookie FICA", async () => {
    pote.valores.set(COOKIE, "r-1");
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    const r = await chamar("renovar");
    expect(r.status).toBe(503);
    expect(pote.delete).not.toHaveBeenCalled();
    expect(pote.valores.get(COOKIE)).toBe("r-1");
  });

  it("sair: avisa a API e apaga o cookie, mesmo se a API falhar", async () => {
    pote.valores.set(COOKIE, "r-1");
    const rede = criarRede({ "POST /auth/sair": () => json({ detail: "fora" }, 500) });
    const r = await chamar("sair");
    expect(r.status).toBe(204);
    expect(rede.chamadas[0]!.corpo).toEqual({ renovacao: "r-1" });
    expect(pote.delete).toHaveBeenCalledWith({ name: COOKIE, path: "/srv/auth" });
    expect(pote.valores.has(COOKIE)).toBe(false);
  });

  it("o cookie que o navegador mandou não segue para a API", async () => {
    const rede = criarRede({ "POST /auth/entrar": () => json(RESPOSTA_ENTRAR) });
    await chamar("entrar", { email: "a@b.com", senha: "s" }, { "x-canteiro": "1", cookie: `${COOKIE}=segredo` });
    expect(new Headers(rede.chamadas[0]!.init.headers).get("cookie")).toBeNull();
  });
});

describe("POST /srv/auth/* — modo de demonstração", () => {
  beforeEach(() => vi.stubEnv("CANTEIRO_DEMO", "1"));

  it("entrar, renovar e sair sem tocar a rede; a renovação roda a cada uso", async () => {
    const rede = criarRede({});
    const entrou = await chamar("entrar", { email: "eu@obra.com", senha: "x" });
    expect(entrou.status).toBe(200);
    const primeira = pote.valores.get(COOKIE)!;
    expect(primeira).toBeTruthy();
    expect(pote.set.mock.calls[0]![2]).toMatchObject({ httpOnly: true, sameSite: "strict", path: "/srv/auth" });

    expect((await chamar("renovar")).status).toBe(200);
    expect(pote.valores.get(COOKIE)).not.toBe(primeira);

    expect((await chamar("sair")).status).toBe(204);
    expect(pote.valores.has(COOKIE)).toBe(false);
    expect(rede.fetch).not.toHaveBeenCalled();
  });

  it("entrar sem senha: 401", async () => {
    criarRede({});
    expect((await chamar("entrar", { email: "eu@obra.com", senha: "" })).status).toBe(401);
    expect(pote.set).not.toHaveBeenCalled();
  });

  it("renovação desconhecida: apaga o cookie e responde 401", async () => {
    criarRede({});
    pote.valores.set(COOKIE, "nao-existe");
    expect((await chamar("renovar")).status).toBe(401);
    expect(pote.valores.has(COOKIE)).toBe(false);
  });
});
