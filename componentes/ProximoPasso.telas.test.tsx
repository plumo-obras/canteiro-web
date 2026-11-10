import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Obra } from "@/lib/contrato";
import { limparSessao } from "@/lib/sessao";
import { criarRede, json, renovarOk, USUARIO } from "@/testes/rede";
import { ProvedorCasca } from "./contexto";
import { Cronograma } from "./cronograma/Cronograma";
import { Orcamento } from "./Orcamento";

// os gráficos e as listas do cronograma têm os próprios testes: aqui só importa a faixa no fim da tela
vi.mock("./cronograma/CurvaS", () => ({ CurvaS: () => null }));
vi.mock("./cronograma/Gantt", () => ({ Gantt: () => null }));
vi.mock("./cronograma/Desembolso", () => ({ Desembolso: () => null }));
vi.mock("./cronograma/Medicao", () => ({ ListaMedicoes: () => <p>medições</p>, ModalMedicao: () => null }));

const PASSO = { name: "Próximo passo" };
const noCasca = (filho: React.ReactNode) =>
  render(
    <ProvedorCasca usuario={USUARIO} demo={false}>
      {filho}
    </ProvedorCasca>,
  );

beforeEach(limparSessao);
afterEach(() => {
  limparSessao();
  vi.unstubAllGlobals();
});

describe("faixa no Orçamento", () => {
  const ORC = {
    versoes: [{ id: "v1", tipo: "contrato", numero: 0, descricao: "Estrutura", arquivo: "planilha.xlsx", ativa: true, itens: 1, etapas: 1, total: 100 }],
    itens: [],
    etapas: [{ etapa: "1", descricao: "Estrutura", atual: 100 }],
    totais: { contratado: 100, aditivos: 0, atual: 100, saldo: 100, comprometido: 0, realizado: 0, aditivos_pct: 0, n_itens: 1, n_etapas: 1 },
  };
  const insumo = (falta: number) => ({ insumo: { precisa_ate_o_fim: 1000, valor_unitario: 1 }, conta: { precisa: 1000, falta } });
  const rede = (insumos: unknown[]) =>
    criarRede({
      "POST /srv/auth/renovar": renovarOk,
      "GET /srv/api/obras/o1/orcamento": () => json(ORC),
      "GET /srv/api/obras/o1/insumos": () => json(insumos),
    });
  const obra = (status: Obra["status"]) => ({ id: "o1", nome: "Casa Inventada", status, verba: 0 }) as Obra;

  it("aprovado e com compra por fazer: leva a Compras dizendo quantos itens faltam", async () => {
    rede([insumo(1000), insumo(1000), insumo(0)]);
    noCasca(<Orcamento obra={obra("em_andamento")} />);
    const faixa = await screen.findByRole("region", PASSO);
    expect(faixa).toHaveTextContent("2 itens ainda não foram comprados.");
    expect(screen.getByRole("link", { name: "Comprar o que vem primeiro" })).toHaveAttribute("href", "/?obra=o1&tela=suprimentos");
    // no topo, antes das etapas: no fim da tela ficava a 1.800 px e quem acabava de aprovar não via
    const etapa = screen.getByText("Estrutura", { selector: "b" });
    expect(faixa.compareDocumentPosition(etapa) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("antes de aprovar não sugere comprar", async () => {
    rede([insumo(1000)]);
    noCasca(<Orcamento obra={obra("em_orcamento")} />);
    await screen.findByText("Estrutura", { selector: "b" });
    expect(screen.queryByRole("region", PASSO)).toBeNull();
  });
});

describe("faixa no Cronograma", () => {
  const CRONO = {
    inicio: "2026-11", meses: 2, etapas: [], mensal: [], medicoes: [], revisoes: 0,
    prazo: { termino_contratual: "2026-12", termino_projetado: "2026-12", atraso_meses: null, atraso_decimos: null, pct_medido: null },
  };
  const OBRA = { id: "o1", nome: "Casa Inventada" } as Obra;

  it("com cronograma montado, leva à conversa com o mestre de obras", async () => {
    criarRede({ "POST /srv/auth/renovar": renovarOk, "GET /srv/api/obras/o1/cronograma": () => json(CRONO) });
    noCasca(<Cronograma obra={OBRA} />);
    await screen.findByRole("region", PASSO);
    expect(screen.getByRole("link", { name: "Ir para o mestre de obras" })).toHaveAttribute("href", "/?obra=o1&tela=conversa");
  });

  it("sem cronograma, o próximo passo é montá-lo", async () => {
    criarRede({ "POST /srv/auth/renovar": renovarOk, "GET /srv/api/obras/o1/cronograma": () => json({ ...CRONO, inicio: null, meses: 0 }) });
    noCasca(<Cronograma obra={OBRA} />);
    await screen.findByRole("heading", { name: "Sem cronograma ainda" });
    expect(screen.queryByRole("region", PASSO)).toBeNull();
  });
});
