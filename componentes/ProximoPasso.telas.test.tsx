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
    totais: { contratado: 100, aditivos: 0, atual: 100, saldo: 100, gasto: 0, aditivos_pct: 0, n_itens: 1, n_etapas: 1 },
  };
  const obra = (status: Obra["status"]) => ({ id: "o1", nome: "Casa Inventada", status, verba: 0 }) as Obra;

  it("nem antes nem depois de aprovar a tela empurra para comprar: não há faixa de próximo passo", async () => {
    for (const status of ["em_orcamento", "em_andamento"] as const) {
      const rede = criarRede({ "POST /srv/auth/renovar": renovarOk, "GET /srv/api/obras/o1/orcamento": () => json(ORC) });
      const { unmount } = noCasca(<Orcamento obra={obra(status)} />);
      await screen.findByRole("table");
      expect(screen.queryByRole("region", PASSO)).toBeNull();
      // a lista de insumos de Compras não existe mais: a tela nem pergunta por ela
      expect(rede.chamadas.some((c) => c.caminho.includes("/insumos"))).toBe(false);
      unmount();
    }
  });
});

describe("faixa no Cronograma", () => {
  const CRONO = {
    inicio: "2026-11", meses: 2, etapas: [], mensal: [], medicoes: [], revisoes: 0,
    prazo: { termino_contratual: "2026-12", termino_projetado: "2026-12", atraso_meses: null, atraso_decimos: null, pct_medido: null },
  };
  const OBRA = { id: "o1", nome: "Casa Inventada" } as Obra;

  it("com cronograma montado, o caminho ao Plumo é o botão do cabeçalho, não a faixa (o protótipo não tem faixa)", async () => {
    criarRede({ "POST /srv/auth/renovar": renovarOk, "GET /srv/api/obras/o1/cronograma": () => json(CRONO) });
    noCasca(<Cronograma obra={OBRA} />);
    expect(await screen.findByRole("button", { name: "Atualizar o andamento conversando" })).toBeInTheDocument();
    expect(screen.queryByRole("region", PASSO)).toBeNull();
  });

  it("sem cronograma, o próximo passo é montá-lo", async () => {
    criarRede({ "POST /srv/auth/renovar": renovarOk, "GET /srv/api/obras/o1/cronograma": () => json({ ...CRONO, inicio: null, meses: 0 }) });
    noCasca(<Cronograma obra={OBRA} />);
    await screen.findByRole("heading", { name: "Sem cronograma ainda" });
    expect(screen.queryByRole("region", PASSO)).toBeNull();
  });
});
