import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Papel } from "@/lib/contrato";
import { ProvedorCasca } from "../contexto";
import { criarRede, json, USUARIO } from "@/testes/rede";
import { Conta } from "./Conta";

vi.mock("@/lib/sessao", () => ({ comAcesso: (u: string, i: RequestInit) => fetch(u, i), trocarSenha: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

const CREDITOS = { saldo_microdolares: 15_000_000, franquia: 20_000_000, chave_propria: false, usuario_id: "u-1", tenant_id: "t-1" };

function montar(papel: Papel) {
  criarRede({
    "GET /srv/api/conta": () =>
      json({
        usuario: { id: "u-1", nome: "Rizzi", email: "eu@obra.com", papel },
        tenant: { id: "t-1", nome: "Construtora Exemplo" },
        chave_propria: null,
        creditos: CREDITOS,
      }),
    "GET /srv/api/uso": () => json({ total: { custo: 0, tokens: 0 }, por_dia: [], por_obra: [], por_rota: [] }),
    "GET /srv/api/obras": () => json([]),
  });
  render(
    <ProvedorCasca usuario={null} demo={false}>
      <Conta usuario={{ ...USUARIO, papel }} />
    </ProvedorCasca>,
  );
}

describe("/conta: quem troca a chave da Anthropic", () => {
  it.each(["admin", "master"] as const)("%s vê Conectar chave", async (papel) => {
    montar(papel);
    expect(await screen.findByRole("button", { name: "Conectar chave" })).toBeTruthy();
  });

  it("leitura só vê a situação", async () => {
    montar("viewer");
    expect(await screen.findByText(/Só admin ou master/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Conectar chave" })).toBeNull();
  });

  it("no HTML a chave vem antes da senha: o Tab segue a ordem do desktop", async () => {
    montar("admin");
    const chave = await screen.findByRole("button", { name: "Conectar chave" });
    const senha = screen.getByRole("button", { name: "Trocar senha" });
    expect(chave.compareDocumentPosition(senha) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
