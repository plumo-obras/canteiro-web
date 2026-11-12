import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Cronograma as DadosCronograma, Obra } from "@/lib/contrato";
import { limparSessao } from "@/lib/sessao";
import { criarRede, json, renovarOk, USUARIO } from "@/testes/rede";
import { ProvedorCasca } from "../contexto";
import { Cronograma } from "./Cronograma";

const OBRA = { id: "o1", nome: "Casa Fictícia", status: "em_andamento", prazo_meses: 3 } as Obra;

const mes = (m: string, prev: number, med: number | null) => ({
  mes: m, previsto: 100_00, previsto_acumulado: 100_00, pct_previsto_acumulado: prev, medido: med === null ? null : 100_00, medido_acumulado: null, pct_medido_acumulado: med,
});

const CRONO: DadosCronograma = {
  inicio: "2026-10",
  meses: 3,
  etapas: [
    { etapa: "1", descricao: "Fundações", atual: 300_00, percentuais: [5000, 5000, 0], medido_acumulado: 2000 },
    { etapa: "2", descricao: "Estrutura", atual: 300_00, percentuais: [0, 5000, 5000], medido_acumulado: 0 },
    { etapa: "3", descricao: "Acabamento", atual: 300_00, percentuais: [0, 0, 10000], medido_acumulado: 0 },
  ],
  mensal: [mes("2026-10", 1667, 667), mes("2026-11", 5000, null), mes("2026-12", 10000, null)],
  medicoes: [],
  prazo: { termino_contratual: "2026-12", termino_projetado: "2026-12", atraso_meses: 0, atraso_decimos: 0, pct_previsto_na_medicao: 1667, pct_medido: 667, mes_referencia: "2026-10" },
} as unknown as DadosCronograma;

function abrir() {
  criarRede({
    "POST /srv/auth/renovar": renovarOk,
    "GET /srv/api/obras/o1/cronograma": () => json(CRONO),
    "GET /srv/api/obras/o1/desembolso": () => json({ detail: "fora do teste" }, 500),
  });
  render(
    <ProvedorCasca usuario={USUARIO} demo={false}>
      <Cronograma obra={OBRA} />
    </ProvedorCasca>,
  );
}

beforeEach(() => {
  // o Gantt mede os rótulos dos meses; o jsdom não tem ResizeObserver
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});
afterEach(() => {
  limparSessao();
  vi.unstubAllGlobals();
});

describe("tela do cronograma", () => {
  it("na demonstração sem cronograma, entra o simulado; com dado real, nunca", async () => {
    criarRede({
      "POST /srv/auth/renovar": renovarOk,
      "GET /srv/api/obras/o1/cronograma": () => json({ ...CRONO, inicio: null, meses: 0, mensal: [] }),
    });
    render(
      <ProvedorCasca usuario={USUARIO} demo>
        <Cronograma obra={OBRA} />
      </ProvedorCasca>,
    );
    // o simulado usa as etapas do orçamento da obra (aqui, as três do fixture) e só inventa os meses
    expect(await screen.findByRole("button", { name: /^3 · Acabamento/ })).toBeInTheDocument();
    expect(screen.getByText(/Valores fictícios/)).toBeInTheDocument();
    // lançar a medição no simulado não grava nada: só avisa que é prévia
    await userEvent.click(screen.getByRole("button", { name: "Lançar medição" }));
    expect(await screen.findByText("Prévia: ainda não é salvo.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("fora da demonstração, sem cronograma é o estado vazio (o simulado não aparece)", async () => {
    criarRede({
      "POST /srv/auth/renovar": renovarOk,
      "GET /srv/api/obras/o1/cronograma": () => json({ ...CRONO, inicio: null, meses: 0, mensal: [] }),
    });
    render(
      <ProvedorCasca usuario={USUARIO} demo={false}>
        <Cronograma obra={OBRA} />
      </ProvedorCasca>,
    );
    expect(await screen.findByRole("heading", { name: "Sem cronograma ainda" })).toBeInTheDocument();
    expect(screen.queryByText(/Valores fictícios/)).toBeNull();
  });

  it("o topo diz término, situação e medido; a ação principal é lançar a medição", async () => {
    abrir();
    expect(await screen.findByText("em dia")).toBeInTheDocument();
    expect(screen.getByText("6,67% medido")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lançar medição" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Atualizar o andamento conversando" })).toBeInTheDocument();
  });

  it("uma vista por vez: Etapas (com o filtro Mostrar), Curva S e Desembolso", async () => {
    abrir();
    await screen.findByRole("tab", { name: "Etapas" });
    expect(screen.getByRole("group", { name: "Mostrar" })).toBeInTheDocument();
    // a Fundação tem 20% medido e 50% previsto em out: atrasada; o contador vai no botão
    expect(within(screen.getByRole("button", { name: /Atrasadas/ })).getByText("1")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Próximas/ }));
    expect(screen.getByRole("button", { name: /^2 · Estrutura/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^1 · Fundações/ })).toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: "Curva S" }));
    expect(screen.getByRole("img", { name: /Curva S/ })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Mostrar" })).toBeNull();
  });

  it("as medições saem da tela e ficam no ⋯, numa gaveta", async () => {
    abrir();
    await screen.findByRole("tab", { name: "Etapas" });
    expect(screen.queryByRole("heading", { name: "Medições" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Mais ações do cronograma" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Ver medições" }));
    expect(await screen.findByRole("dialog", { name: "Medições" })).toHaveTextContent("Nenhuma medição ainda");
  });

  it("no celular, no lugar do Gantt, a lista Agora / Próximas / Todas com o convite ao Plumo", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("max-width"), addEventListener: () => {}, removeEventListener: () => {} }));
    abrir();
    const mostrar = await screen.findByRole("group", { name: "Mostrar" });
    expect(within(mostrar).getByRole("button", { name: "Agora" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/previsto até hoje/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Fundações/ })).toHaveTextContent("20% feito · 50% previsto");
    expect(screen.queryByRole("button", { name: /Acabamento/ })).toBeNull();
    await userEvent.click(within(mostrar).getByRole("button", { name: "Todas" }));
    expect(screen.getByRole("button", { name: /Acabamento/ })).toHaveTextContent("começa dez");
    expect(screen.getByRole("button", { name: "Contar ao Plumo como está a obra" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Atualizar o andamento conversando" })).toBeNull();
  });
});
