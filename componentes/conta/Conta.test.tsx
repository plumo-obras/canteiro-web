import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Papel } from "@/lib/contrato";
import { ProvedorCasca } from "../contexto";
import { criarRede, json, USUARIO } from "@/testes/rede";
import { Conta } from "./Conta";

const sair = vi.hoisted(() => vi.fn());
const replace = vi.hoisted(() => vi.fn());
vi.mock("@/lib/sessao", () => ({ comAcesso: (u: string, i: RequestInit) => fetch(u, i), trocarSenha: vi.fn(), sair }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
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

describe("/conta: o que o protótipo mostra", () => {
  it("uso de IA com a franquia numa linha; Comprar créditos e Por rota fora da tela", async () => {
    montar("admin");
    expect(await screen.findByRole("heading", { name: "Uso de IA · últimos 30 dias" })).toBeTruthy();
    expect(await screen.findByText(/Créditos da plataforma: US\$ 15,00 de US\$ 20,00 da franquia/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Comprar créditos/ })).toBeNull();
    expect(screen.queryByText("Por rota")).toBeNull();
  });

  it("Editar nome é prévia: muda só a tela e avisa que não salvou", async () => {
    const rede = criarRede({
      "GET /srv/api/conta": () =>
        json({ usuario: { id: "u-1", nome: "Rizzi", email: "eu@obra.com", papel: "admin" }, tenant: { id: "t-1", nome: "Construtora Exemplo" }, chave_propria: null, creditos: CREDITOS }),
      "GET /srv/api/uso": () => json({ total: { custo: 0, tokens: 0 }, por_dia: [], por_obra: [], por_rota: [] }),
      "GET /srv/api/obras": () => json([]),
    });
    render(
      <ProvedorCasca usuario={null} demo={false}>
        <Conta usuario={{ ...USUARIO, papel: "admin" }} />
      </ProvedorCasca>,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Editar nome" }));
    const campo = screen.getByLabelText("Seu nome");
    await userEvent.clear(campo);
    await userEvent.type(campo, "Rizzi Inventado");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(screen.getByText("Rizzi Inventado")).toBeTruthy();
    expect(await screen.findByText("Prévia: ainda não é salvo.")).toBeTruthy();
    // nenhuma escrita saiu do navegador
    expect(rede.chamadas.filter((c) => c.metodo !== "GET")).toEqual([]);
  });
});

describe("/conta no celular", () => {
  it("Trocar senha, Tema e Sair viram uma lista; Sair volta ao login", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("max-width: 760px"), addEventListener() {}, removeEventListener() {} }));
    sair.mockResolvedValue(undefined);
    montar("admin");
    const lista = await screen.findByRole("group", { name: "Opções da conta" });
    expect(within(lista).getByRole("button", { name: "Trocar senha" })).toBeTruthy();
    expect(within(lista).getByRole("button", { name: /^Tema/ })).toBeTruthy();
    await userEvent.click(within(lista).getByRole("button", { name: "Sair" }));
    expect(sair).toHaveBeenCalled();
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/entrar"));
  });
});
