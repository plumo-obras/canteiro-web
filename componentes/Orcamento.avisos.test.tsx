import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Obra, Usuario } from "@/lib/contrato";
import { limparSessao } from "@/lib/sessao";
import { criarRede, json, renovarOk, USUARIO } from "@/testes/rede";
import { ProvedorCasca } from "./contexto";
import { Orcamento, soDasPranchas } from "./Orcamento";

const OBRA = { id: "o1", nome: "Casa Inventada", status: "em_orcamento", verba: 62000000 } as Obra;
const orc = (arquivo: string, precos: number[]) => ({
  versoes: [{ id: "v1", tipo: "contrato", numero: 0, descricao: "Estrutura", arquivo, ativa: true, itens: precos.length, etapas: 1, total: 0, registro_id: "r1" }],
  itens: precos.map((valor_unitario, i) => ({ id: `i${i}`, versao_id: "v1", tipo: "item", etapa: "1", descricao: `Item ${i}`, unidade: "kg", quantidade: 1000, valor_unitario, total: valor_unitario, curva: null })),
  etapas: [{ etapa: "1", descricao: "Estrutura", contratado: 0, aditivos: 0, atual: 0, cotando: 0, comprometido: 0, realizado: 0, saldo: 0, estourou: false }],
  totais: { contratado: 0, aditivos: 0, atual: 0, saldo: 0, cotando: 0, comprometido: 0, realizado: 0, aditivos_pct: 0, n_itens: precos.length, n_etapas: 1, sem_etapa: {} },
});
const montar = (dados: unknown, usuario: Usuario = USUARIO) => {
  criarRede({
    "POST /srv/auth/renovar": renovarOk,
    "GET /srv/api/obras/o1/orcamento": () => json(dados),
    "GET /srv/api/obras/o1/insumos": () => json([]),
  });
  render(
    <ProvedorCasca usuario={usuario} demo={false}>
      <Orcamento obra={OBRA} />
    </ProvedorCasca>,
  );
};
const PRANCHAS = "Estrutura (projeto).csv";

beforeEach(limparSessao);
afterEach(() => {
  limparSessao();
  vi.unstubAllGlobals();
});

describe("avisos do Orçamento", () => {
  it("itens sem preço: avisa na tela e o aprovar pede confirmação explícita", async () => {
    montar(orc("planilha.xlsx", [0, 0, 500]));
    expect(await screen.findByText("2 itens sem preço.")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Aprovar" }));
    const dialogo = screen.getByRole("dialog", { name: "Aprovar o orçamento?" });
    expect(dialogo).toHaveTextContent("2 itens estão sem preço.");
    expect(within(dialogo).getByRole("button", { name: "Aprovar mesmo assim" })).toBeInTheDocument();
  });

  it("todos com preço: sem aviso e o botão de sempre", async () => {
    montar(orc("planilha.xlsx", [500, 700]));
    await userEvent.setup().click(await screen.findByRole("button", { name: "Aprovar" }));
    const dialogo = screen.getByRole("dialog", { name: "Aprovar o orçamento?" });
    expect(within(dialogo).getByRole("button", { name: "Aprovar orçamento" })).toBeInTheDocument();
    expect(screen.queryByText(/sem preço/)).toBeNull();
  });

  it("veio só das pranchas: diz o que falta e abre o caminho para completar", async () => {
    montar(orc(PRANCHAS, [500]));
    expect(await screen.findByText(/só o que as pranchas trazem/)).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("Cobertura, piso, instalações e mão de obra ainda não estão nele.");
    expect(within(screen.getByRole("note")).getByRole("button", { name: "Importar planilha" })).toBeInTheDocument();
  });

  it("viewer lê o aviso, sem o botão de importar", async () => {
    montar(orc(PRANCHAS, [500]), { ...USUARIO, papel: "viewer" });
    expect(await screen.findByText(/só o que as pranchas trazem/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Importar planilha" })).toBeNull();
  });

  it("a versão inicial aparece como orçamento inicial, nunca contrato", async () => {
    montar({ ...orc("planilha.xlsx", [500]), versoes: [...orc("planilha.xlsx", [500]).versoes, { ...orc("x", [1]).versoes[0], id: "v2", tipo: "aditivo", numero: 1 }] });
    expect(await screen.findByText("Orçamento inicial")).toBeInTheDocument();
    expect(screen.queryByText("Contrato")).toBeNull();
  });
});

describe("soDasPranchas", () => {
  const v = (arquivo: string, ativa = true) => ({ arquivo, ativa });
  it("só quando tudo o que vale saiu do Projeto", () => {
    expect(soDasPranchas([])).toBe(false);
    expect(soDasPranchas([v(PRANCHAS)])).toBe(true);
    expect(soDasPranchas([v(PRANCHAS), v("planilha.xlsx")])).toBe(false);
    expect(soDasPranchas([v(PRANCHAS), v("planilha.xlsx", false)])).toBe(true);
  });
});
