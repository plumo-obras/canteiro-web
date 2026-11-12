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

  it("renovar com 409 da API (renovação no ar): repassa 409 e o cookie FICA", async () => {
    pote.valores.set(COOKIE, "r-1");
    criarRede({ "POST /auth/renovar": () => json({ detail: "Renovação em andamento; tente de novo." }, 409) });
    const r = await chamar("renovar");
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ detail: "Renovação em andamento; tente de novo." });
    expect(pote.delete).not.toHaveBeenCalled();
    expect(pote.set).not.toHaveBeenCalled();
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

describe("POST /srv/auth/senha — troca de senha", () => {
  const TROCA = { senha_atual: "velha-123", senha_nova: "nova-senha-456" };
  const comAcesso = { "x-canteiro": "1", authorization: "Bearer acesso-1" };

  it("sem o header x-canteiro: 403 sem chamar a API", async () => {
    const rede = criarRede({});
    const r = await chamar("senha", TROCA, { authorization: "Bearer acesso-1" });
    expect(r.status).toBe(403);
    expect(rede.fetch).not.toHaveBeenCalled();
  });

  it("origem de outro site: 403", async () => {
    const rede = criarRede({});
    const r = await chamar("senha", TROCA, { ...comAcesso, host: "localhost:3000", origin: "https://mal.example" });
    expect(r.status).toBe(403);
    expect(rede.fetch).not.toHaveBeenCalled();
  });

  it("repassa o Bearer e o corpo; no 200 grava a renovação nova com as flags do entrar e devolve só o acesso", async () => {
    pote.valores.set(COOKIE, "r-velha");
    const rede = criarRede({ "POST /auth/senha": () => json({ ...RESPOSTA_ENTRAR, renovacao: "r-nova" }) });
    const r = await chamar("senha", TROCA, comAcesso);
    expect(r.status).toBe(200);
    const h = new Headers(rede.chamadas[0]!.init.headers);
    expect(h.get("authorization")).toBe("Bearer acesso-1");
    expect(rede.chamadas[0]!.corpo).toEqual(TROCA);
    const corpo = (await r.json()) as Record<string, unknown>;
    expect(corpo).toMatchObject({ acesso: "acesso-1", usuario: USUARIO });
    expect(corpo).toHaveProperty("expira_em");
    expect(JSON.stringify(corpo)).not.toContain("r-nova");
    expect(pote.valores.get(COOKIE)).toBe("r-nova");
    expect(pote.set.mock.calls[0]![2]).toMatchObject({ httpOnly: true, sameSite: "strict", path: "/srv/auth" });
  });

  it.each([
    [401, "Senha atual incorreta."],
    [422, "A nova senha precisa ser diferente da atual."],
    [429, "Muitas tentativas com a senha errada. Espere alguns minutos e tente de novo."],
  ])("recusa da API (%i): repassa a mensagem e o cookie FICA", async (status, detail) => {
    pote.valores.set(COOKIE, "r-1");
    criarRede({ "POST /auth/senha": () => json({ detail }, status) });
    const r = await chamar("senha", TROCA, comAcesso);
    expect(r.status).toBe(status);
    expect(await r.json()).toEqual({ detail });
    expect(pote.delete).not.toHaveBeenCalled();
    expect(pote.set).not.toHaveBeenCalled();
    expect(pote.valores.get(COOKIE)).toBe("r-1");
  });

  it("401 do acesso vencido (com WWW-Authenticate) vem marcado como sessão expirada, e o cookie fica", async () => {
    pote.valores.set(COOKIE, "r-1");
    criarRede({
      "POST /auth/senha": () =>
        new Response(JSON.stringify({ detail: "Sessão expirada ou inválida. Entre de novo." }), {
          status: 401,
          headers: { "content-type": "application/json", "www-authenticate": "Bearer" },
        }),
    });
    const r = await chamar("senha", TROCA, comAcesso);
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ detail: "Sessão expirada ou inválida. Entre de novo.", sessao_expirada: true });
    expect(pote.valores.get(COOKIE)).toBe("r-1");
  });

  it("sem Authorization: 401 de sessão expirada sem chamar a API", async () => {
    const rede = criarRede({});
    const r = await chamar("senha", TROCA);
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({ sessao_expirada: true });
    expect(rede.fetch).not.toHaveBeenCalled();
  });

  it.each([500, 502])("API em erro (%i): 503 e o cookie FICA", async (status) => {
    pote.valores.set(COOKIE, "r-1");
    criarRede({ "POST /auth/senha": () => json({ detail: "Internal Server Error" }, status) });
    const r = await chamar("senha", TROCA, comAcesso);
    expect(r.status).toBe(503);
    expect(pote.delete).not.toHaveBeenCalled();
    expect(pote.valores.get(COOKIE)).toBe("r-1");
  });

  it("rede caindo: 503 e o cookie FICA", async () => {
    pote.valores.set(COOKIE, "r-1");
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    const r = await chamar("senha", TROCA, comAcesso);
    expect(r.status).toBe(503);
    expect(pote.valores.get(COOKIE)).toBe("r-1");
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

  it("trocar senha: responde sucesso com par novo, sem tocar a rede; regras iguais às da API", async () => {
    const rede = criarRede({});
    const entrou = (await (await chamar("entrar", { email: "eu@obra.com", senha: "x" })).json()) as { acesso: string };
    const h = { "x-canteiro": "1", authorization: `Bearer ${entrou.acesso}` };
    const curta = await chamar("senha", { senha_atual: "x", senha_nova: "curta" }, h);
    expect(curta.status).toBe(422);
    expect(await curta.json()).toEqual({ detail: "A nova senha precisa ter de 8 a 256 caracteres." });
    const antes = pote.valores.get(COOKIE);
    const r = await chamar("senha", { senha_atual: "x", senha_nova: "uma-senha-nova" }, h);
    expect(r.status).toBe(200);
    expect(pote.valores.get(COOKIE)).not.toBe(antes);
    expect((await chamar("senha", { senha_atual: "x", senha_nova: "uma-senha-nova" }, { "x-canteiro": "1" })).status).toBe(401);
    expect(rede.fetch).not.toHaveBeenCalled();
  });

  it("renovação desconhecida: apaga o cookie e responde 401", async () => {
    criarRede({});
    pote.valores.set(COOKIE, "nao-existe");
    expect((await chamar("renovar")).status).toBe(401);
    expect(pote.valores.has(COOKIE)).toBe(false);
  });
});

describe("POST /srv/auth/entrar — Manter conectado", () => {
  it("desmarcado: o cookie vira de sessão (sem maxAge) e continua assim nas renovações", async () => {
    criarRede({
      "POST /auth/entrar": () => json(RESPOSTA_ENTRAR),
      "POST /auth/renovar": () => json({ ...RESPOSTA_ENTRAR, renovacao: "renovacao-2" }),
    });
    expect((await chamar("entrar", { email: "a@b.com", senha: "s", manter: false })).status).toBe(200);
    const doEntrar = pote.set.mock.calls.find(([n]) => n === COOKIE)!;
    expect(doEntrar[2]?.maxAge).toBeUndefined();
    expect(doEntrar[2]?.httpOnly).toBe(true);

    pote.set.mockClear();
    expect((await chamar("renovar")).status).toBe(200);
    const daRenovacao = pote.set.mock.calls.find(([n]) => n === COOKIE)!;
    expect(daRenovacao[1]).toBe("renovacao-2");
    expect(daRenovacao[2]?.maxAge).toBeUndefined();
  });

  it("marcado (ou cliente antigo, sem o campo): os 30 dias de sempre, e a marca de sessão curta sai", async () => {
    criarRede({ "POST /auth/entrar": () => json(RESPOSTA_ENTRAR) });
    pote.valores.set(`${COOKIE}_curta`, "1");
    await chamar("entrar", { email: "a@b.com", senha: "s", manter: true });
    expect(pote.set.mock.calls.find(([n]) => n === COOKIE)![2]?.maxAge).toBeGreaterThan(0);
    expect(pote.valores.has(`${COOKIE}_curta`)).toBe(false);
    pote.set.mockClear();
    await chamar("entrar", { email: "a@b.com", senha: "s" });
    expect(pote.set.mock.calls.find(([n]) => n === COOKIE)![2]?.maxAge).toBeGreaterThan(0);
  });
});
