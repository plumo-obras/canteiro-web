import { afterEach, describe, expect, it } from "vitest";
import { comAcesso, limparSessao, usuarioAtual } from "./sessao";
import { criarRede, json, renovarOk } from "@/testes/rede";

afterEach(() => limparSessao());

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
});
