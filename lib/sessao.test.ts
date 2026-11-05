import { afterEach, describe, expect, it, vi } from "vitest";
import { ESPERA_RENOVACAO_EM_ANDAMENTO_MS, acessoAtual, comAcesso, limparSessao, renovarSessao, trocarSenha, usuarioAtual } from "./sessao";
import { USUARIO, criarRede, json, renovarOk } from "@/testes/rede";

afterEach(() => {
  limparSessao();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete (document as { visibilityState?: unknown }).visibilityState; // volta ao getter do jsdom
});

describe("sessão em memória com renovação automática", () => {
  it("sem acesso, renova pelo cookie antes da 1ª chamada e manda o Bearer", async () => {
    const rede = criarRede({ "POST /srv/auth/renovar": renovarOk, "GET /srv/api/obras": () => json([]) });
    await comAcesso("/srv/api/obras");
    expect(usuarioAtual()?.nome).toBe("Rizzi");
    const obras = rede.chamadas.find((c) => c.caminho === "/srv/api/obras")!;
    expect(new Headers(obras.init.headers).get("authorization")).toBe("Bearer acesso-1");
    // a renovação leva o header anti-CSRF; o token nunca vai para o storage
    expect(new Headers(rede.chamadas[0]!.init.headers).get("x-canteiro")).toBe("1");
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });

  it("num 401, renova UMA vez (mesmo com chamadas simultâneas) e repete", async () => {
    let n = 0;
    let renovacoes = 0;
    criarRede({
      "POST /srv/auth/renovar": () => {
        renovacoes++;
        return json({ acesso: `acesso-${++n}`, usuario: null, expira_em: 900 });
      },
      "GET /srv/api/obras": ({ init }) =>
        new Headers(init.headers).get("authorization") === "Bearer acesso-2" ? json([{ id: "o1" }]) : json({ detail: "expirou" }, 401),
    });
    const rs = await Promise.all([comAcesso("/srv/api/obras"), comAcesso("/srv/api/obras")]);
    expect(rs.map((r) => r.status)).toEqual([200, 200]);
    expect(renovacoes).toBe(2); // 1 para começar + 1 para os dois 401 juntos
  });

  it("renovação recusada encerra a sessão", async () => {
    criarRede({ "POST /srv/auth/renovar": () => json({ detail: "acabou" }, 401), "GET /srv/api/obras": () => json({}, 401) });
    const r = await comAcesso("/srv/api/obras");
    expect(r.status).toBe(401);
    expect(usuarioAtual()).toBeNull();
  });

  it("erro do servidor na renovação não derruba a sessão: só a recusa (401/403) derruba", async () => {
    let status = 200;
    criarRede({ "POST /srv/auth/renovar": () => (status === 200 ? renovarOk() : json({ detail: "fora" }, status)) });
    expect(await renovarSessao()).toBe("ok");
    status = 503;
    expect(await renovarSessao()).toBe("falha");
    expect(usuarioAtual()?.nome).toBe("Rizzi");
    status = 401;
    expect(await renovarSessao()).toBe("negado");
    expect(usuarioAtual()).toBeNull();
  });

  it("renova dentro do lock entre abas, quando o navegador tem Web Locks", async () => {
    const nomes: string[] = [];
    vi.stubGlobal("navigator", {
      ...navigator,
      locks: { request: (nome: string, f: () => Promise<unknown>) => (nomes.push(nome), f()) },
    });
    criarRede({ "POST /srv/auth/renovar": renovarOk });
    expect(await renovarSessao()).toBe("ok");
    expect(nomes).toEqual(["canteiro-renovacao"]);
  });

  it("a renovação vai com keepalive: termina mesmo se a página recarregar no meio", async () => {
    const rede = criarRede({ "POST /srv/auth/renovar": renovarOk });
    expect(await renovarSessao()).toBe("ok");
    expect(rede.chamadas[0]!.init.keepalive).toBe(true);
  });
});

describe("renovação em andamento (409: o cookie foi trocado por outra renovação ainda no ar)", () => {
  it("espera e tenta de novo uma vez; com o cookie novo, renova", async () => {
    vi.useFakeTimers();
    const respostas = [json({ detail: "Renovação em andamento; tente de novo." }, 409), renovarOk()];
    const rede = criarRede({ "POST /srv/auth/renovar": () => respostas.shift()! });
    const resultado = renovarSessao();
    await vi.advanceTimersByTimeAsync(ESPERA_RENOVACAO_EM_ANDAMENTO_MS - 1);
    expect(rede.chamadas).toHaveLength(1); // ainda esperando o cookie novo
    await vi.advanceTimersByTimeAsync(1);
    expect(await resultado).toBe("ok");
    expect(rede.chamadas).toHaveLength(2);
    expect(usuarioAtual()?.nome).toBe("Rizzi");
  });

  it("409 de novo: vira \"falha\" (tenta mais tarde) e não derruba a sessão", async () => {
    vi.useFakeTimers();
    criarRede({ "POST /srv/auth/renovar": renovarOk });
    expect(await renovarSessao()).toBe("ok");
    const rede = criarRede({ "POST /srv/auth/renovar": () => json({ detail: "em andamento" }, 409) });
    const resultado = renovarSessao();
    await vi.advanceTimersByTimeAsync(ESPERA_RENOVACAO_EM_ANDAMENTO_MS);
    expect(await resultado).toBe("falha");
    expect(rede.chamadas).toHaveLength(2); // uma nova tentativa só
    expect(usuarioAtual()?.nome).toBe("Rizzi");
  });

  it("409 e depois 401: a sessão acabou", async () => {
    vi.useFakeTimers();
    const respostas = [json({ detail: "em andamento" }, 409), json({ detail: "acabou" }, 401)];
    criarRede({ "POST /srv/auth/renovar": () => respostas.shift()! });
    const resultado = renovarSessao();
    await vi.advanceTimersByTimeAsync(ESPERA_RENOVACAO_EM_ANDAMENTO_MS);
    expect(await resultado).toBe("negado");
    expect(usuarioAtual()).toBeNull();
  });
});

describe("renovação pelo relógio só com a aba visível", () => {
  let visibilidade: DocumentVisibilityState = "visible";
  const mudarPara = (v: DocumentVisibilityState) => {
    visibilidade = v;
    document.dispatchEvent(new Event("visibilitychange"));
  };
  const simularVisibilidade = () => {
    visibilidade = "visible";
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibilidade });
  };

  it("visível: renova um minuto antes de vencer", async () => {
    vi.useFakeTimers();
    simularVisibilidade();
    const rede = criarRede({ "POST /srv/auth/renovar": renovarOk }); // expira_em 900 s
    expect(await renovarSessao()).toBe("ok");
    await vi.advanceTimersByTimeAsync(840_000);
    expect(rede.chamadas).toHaveLength(2);
  });

  it("oculta: o relógio não renova; ao voltar perto do vencimento, renova na hora", async () => {
    vi.useFakeTimers();
    simularVisibilidade();
    const rede = criarRede({ "POST /srv/auth/renovar": renovarOk });
    expect(await renovarSessao()).toBe("ok");
    mudarPara("hidden");
    await vi.advanceTimersByTimeAsync(900_000); // passou da hora e até venceu
    expect(rede.chamadas).toHaveLength(1);
    mudarPara("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(rede.chamadas).toHaveLength(2);
    expect(usuarioAtual()?.nome).toBe("Rizzi");
  });

  it("voltar a ficar visível longe do vencimento não renova", async () => {
    vi.useFakeTimers();
    simularVisibilidade();
    const rede = criarRede({ "POST /srv/auth/renovar": renovarOk });
    expect(await renovarSessao()).toBe("ok");
    mudarPara("hidden");
    await vi.advanceTimersByTimeAsync(60_000);
    mudarPara("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(rede.chamadas).toHaveLength(1);
  });

  it("sem sessão, voltar a ficar visível não renova", async () => {
    vi.useFakeTimers();
    simularVisibilidade();
    const rede = criarRede({ "POST /srv/auth/renovar": renovarOk });
    expect(await renovarSessao()).toBe("ok");
    mudarPara("hidden");
    limparSessao();
    await vi.advanceTimersByTimeAsync(900_000);
    mudarPara("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(rede.chamadas).toHaveLength(1);
  });
});

describe("trocar a própria senha", () => {
  const sessaoNova = () => json({ acesso: "acesso-novo", usuario: { ...USUARIO, nome: "Rizzi" }, expira_em: 900 });

  it("manda o acesso atual e guarda a sessão nova que a API devolve", async () => {
    const rede = criarRede({ "POST /srv/auth/renovar": renovarOk, "POST /srv/auth/senha": sessaoNova });
    await renovarSessao();
    expect(await trocarSenha("velha-123", "nova-senha-456")).toEqual({ ok: true });
    const troca = rede.chamadas.find((c) => c.caminho === "/srv/auth/senha")!;
    const h = new Headers(troca.init.headers);
    expect(h.get("authorization")).toBe("Bearer acesso-1");
    expect(h.get("x-canteiro")).toBe("1");
    expect(troca.corpo).toEqual({ senha_atual: "velha-123", senha_nova: "nova-senha-456" });
    expect(acessoAtual()).toBe("acesso-novo");
  });

  it("senha atual errada: mostra a mensagem, NÃO repete (gastaria outra tentativa) e não derruba a sessão", async () => {
    const rede = criarRede({
      "POST /srv/auth/renovar": renovarOk,
      "POST /srv/auth/senha": () => json({ detail: "Senha atual incorreta." }, 401),
    });
    await renovarSessao();
    expect(await trocarSenha("errada", "nova-senha-456")).toEqual({ ok: false, mensagem: "Senha atual incorreta." });
    expect(rede.chamadas.filter((c) => c.caminho === "/srv/auth/senha")).toHaveLength(1);
    expect(rede.chamadas.filter((c) => c.caminho === "/srv/auth/renovar")).toHaveLength(1);
    expect(usuarioAtual()?.nome).toBe("Rizzi");
    expect(acessoAtual()).toBe("acesso-1");
  });

  it("acesso vencido (sessao_expirada): renova uma vez e repete com o acesso novo", async () => {
    let n = 0;
    const rede = criarRede({
      "POST /srv/auth/renovar": () => json({ acesso: `acesso-${++n}`, usuario: USUARIO, expira_em: 900 }),
      "POST /srv/auth/senha": ({ init }) =>
        new Headers(init.headers).get("authorization") === "Bearer acesso-2"
          ? sessaoNova()
          : json({ detail: "Sessão expirada.", sessao_expirada: true }, 401),
    });
    await renovarSessao();
    expect(await trocarSenha("velha-123", "nova-senha-456")).toEqual({ ok: true });
    expect(rede.chamadas.filter((c) => c.caminho === "/srv/auth/senha")).toHaveLength(2);
    expect(acessoAtual()).toBe("acesso-novo");
  });

  it("422 e 429 voltam com a mensagem da API", async () => {
    let resposta = json({ detail: "A nova senha não pode ser o seu e-mail." }, 422);
    criarRede({ "POST /srv/auth/renovar": renovarOk, "POST /srv/auth/senha": () => resposta });
    await renovarSessao();
    expect(await trocarSenha("a", "eu@obra.com")).toEqual({ ok: false, mensagem: "A nova senha não pode ser o seu e-mail." });
    resposta = json({}, 429);
    expect(await trocarSenha("a", "nova-senha-456")).toEqual({ ok: false, mensagem: "Muitas tentativas. Espere um pouco e tente de novo." });
  });

  it("roda dentro do lock do cookie, o mesmo da renovação", async () => {
    const nomes: string[] = [];
    vi.stubGlobal("navigator", {
      ...navigator,
      locks: { request: (nome: string, f: () => Promise<unknown>) => (nomes.push(nome), f()) },
    });
    criarRede({ "POST /srv/auth/renovar": renovarOk, "POST /srv/auth/senha": sessaoNova });
    await renovarSessao();
    nomes.length = 0;
    await trocarSenha("velha-123", "nova-senha-456");
    expect(nomes).toEqual(["canteiro-renovacao"]);
  });

  it("rede caindo: erro na tela, sessão intacta", async () => {
    criarRede({ "POST /srv/auth/renovar": renovarOk });
    await renovarSessao();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    const r = await trocarSenha("velha-123", "nova-senha-456");
    expect(r.ok).toBe(false);
    expect(acessoAtual()).toBe("acesso-1");
  });
});
