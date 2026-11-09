import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Obra, Orcamento, Usuario } from "@/lib/contrato";
import { limparSessao } from "@/lib/sessao";
import { criarRede, json, renovarOk, USUARIO, type Rota } from "@/testes/rede";
import { ProvedorCasca } from "../contexto";
import { ListaEtapas } from "./ListaEtapas";

const ORC = {
  versoes: [{ id: "v1", tipo: "contrato", numero: 0, descricao: "Estrutura", ativa: true }],
  itens: [
    { id: "e", versao_id: "v1", tipo: "etapa", numero: "1", nivel: 1, etapa: "1", descricao: "Estrutura", unidade: "", quantidade: 0, valor_unitario: 0, total: 0, codigo: "", fonte: "", curva: null },
    { id: "i1", versao_id: "v1", tipo: "item", numero: "1.1", nivel: 2, etapa: "1", descricao: "Aço CA-50", unidade: "kg", quantidade: 220_300, valor_unitario: 0, total: 0, codigo: "", fonte: "", curva: "C" },
  ],
  etapas: [{ etapa: "1", descricao: "Estrutura", contratado: 0, aditivos: 0, atual: 0, cotando: 0, comprometido: 0, realizado: 0, saldo: 0, estourou: false }],
  totais: { contratado: 0, aditivos: 0, atual: 0, saldo: 0, cotando: 0, comprometido: 0, realizado: 0, aditivos_pct: 0, n_itens: 1, n_etapas: 1, sem_etapa: {} },
} as unknown as Orcamento;
const OBRA = { id: "o1", nome: "Casa Inventada", status: "em_orcamento" } as Obra;
const PATCH = "PATCH /srv/api/obras/o1/orcamento/itens/i1";
const nomeVersao = () => "Orçamento inicial";

function montar(extra: Record<string, Rota> = {}, obra = OBRA, usuario: Usuario = USUARIO) {
  const rede = criarRede({ "POST /srv/auth/renovar": renovarOk, "GET /srv/api/obras/o1/pedidos": () => json([]), ...extra });
  render(
    <ProvedorCasca usuario={usuario} demo={false}>
      <ListaEtapas obra={obra} orc={ORC} nomeVersao={nomeVersao} />
    </ProvedorCasca>,
  );
  return rede;
}
const patches = (r: ReturnType<typeof criarRede>) => r.chamadas.filter((c) => c.metodo === "PATCH");

beforeEach(limparSessao);
afterEach(() => {
  limparSessao();
  vi.unstubAllGlobals();
});

describe("editar o item na linha", () => {
  it("o preço vazio se preenche ali: Enter grava uma vez só, com Desfazer", async () => {
    const rede = montar({ [PATCH]: () => json({ item: {}, total_versao: 147_381, registro_id: "r1" }) });
    const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: "Editar Preço de Aço CA-50" }));
    await u.type(screen.getByRole("textbox", { name: "Preço de Aço CA-50" }), "6,69{Enter}");
    expect(await screen.findByText(/Preço de Aço CA-50: R\$\s6,69\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Desfazer" })).toBeInTheDocument();
    expect(patches(rede).map((c) => c.corpo)).toEqual([{ valor_unitario: 669 }]);
  });

  it("sair do campo sem mudar não grava; valor inválido não sai do campo; Esc desiste", async () => {
    const rede = montar({ [PATCH]: () => json({ item: {}, total_versao: 0, registro_id: "r1" }) });
    const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: "Editar Quantidade de Aço CA-50" }));
    await u.tab();
    expect(patches(rede)).toEqual([]);

    await u.click(screen.getByRole("button", { name: "Editar Preço de Aço CA-50" }));
    await u.type(screen.getByRole("textbox", { name: "Preço de Aço CA-50" }), "abc{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Preço em reais");
    expect(patches(rede)).toEqual([]);
    await u.keyboard("{Escape}");
    await waitFor(() => expect(screen.getByRole("button", { name: "Editar Preço de Aço CA-50" })).toHaveFocus());
  });

  it("erro da API avisa e mantém o que foi digitado", async () => {
    montar({ [PATCH]: () => json({ detail: "Esta versão já não vale." }, 409) });
    const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: "Editar Preço de Aço CA-50" }));
    await u.type(screen.getByRole("textbox", { name: "Preço de Aço CA-50" }), "6,69{Enter}");
    expect(await screen.findByText("Esta versão já não vale.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Preço de Aço CA-50" })).toHaveValue("6,69");
  });

  it("depois de aprovado, e para quem só lê, é só leitura", async () => {
    montar({}, { ...OBRA, status: "em_andamento" });
    await screen.findByText("Aço CA-50");
    expect(screen.queryByRole("button", { name: /Editar Preço/ })).toBeNull();
  });

  it("viewer não edita", async () => {
    montar({}, OBRA, { ...USUARIO, papel: "viewer" });
    await screen.findByText("Aço CA-50");
    expect(screen.queryByRole("button", { name: /Editar Preço/ })).toBeNull();
  });
});
