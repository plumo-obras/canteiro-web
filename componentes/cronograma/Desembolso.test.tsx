import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Desembolso as DadosDesembolso, Obra } from "@/lib/contrato";
import { limparSessao } from "@/lib/sessao";
import { criarRede, json, renovarOk, USUARIO } from "@/testes/rede";
import { ProvedorCasca } from "../contexto";
import { avisos, csvDesembolso, curto, Desembolso, textoTermino } from "./Desembolso";

const OBRA = { id: "o1", tenant_id: "t-1", nome: "EMEI Santa Clara do Sul", status: "em_andamento" } as Obra;

const mes = (m: string, pago: number, previsto: number, projetado: number, no_ritmo = projetado) => ({ mes: m, pago, previsto, projetado, projetado_no_ritmo: no_ritmo });

/** Medida em jan, a obra a metade do ritmo: o resto vai até abr pelo cronograma e até jun no ritmo de hoje. */
const D: DadosDesembolso = {
  mes_atual: "2026-02",
  base: "medicao",
  mes_referencia: "2026-01",
  atraso_meses: 1,
  ritmo_pct: 5000,
  termino_projetado: "2026-04",
  termino_no_ritmo: "2026-06",
  meses: [
    mes("2026-01", 30_000, 50_000, 0, 0),
    mes("2026-02", 0, 50_000, 20_000, 20_000),
    mes("2026-03", 0, 0, 150_000, 100_000),
    mes("2026-04", 0, 0, 100_000, 60_000),
    mes("2026-05", 0, 0, 0, 50_000),
    mes("2026-06", 0, 0, 0, 40_000),
  ],
  etapas: [{ etapa: "1", descricao: "Preliminares", atual: 100_000, realizado: 30_000, executado_pct: 5000, falta: 70_000, devido_agora: 20_000, sem_cronograma: false }],
  totais: { orcado: 300_000, realizado: 30_000, pago: 30_000, falta: 270_000, custo_final: 300_000, desvio: 0, entregue_sem_pagamento: 0, sem_mes: 0 },
};

afterEach(() => {
  limparSessao();
  vi.unstubAllGlobals();
});

describe("desembolso: textos", () => {
  it("a faixa do término com os dois cenários, ou um mês só", () => {
    expect(textoTermino(D)).toBe(
      "Último pagamento entre abr/2026, se a obra voltar ao ritmo do cronograma, e jun/2026, no ritmo de hoje (50% do planejado).",
    );
    expect(textoTermino({ ...D, base: "gastos", termino_no_ritmo: "2026-04" })).toBe("Último pagamento previsto em abr/2026.");
    expect(textoTermino({ ...D, termino_projetado: null })).toBeNull();
  });

  it("as ressalvas só aparecem quando valem", () => {
    expect(avisos(D)).toEqual([
      "R$ 200,00 já foram medidos e ainda não pagos: entram como devidos neste mês.",
      "O resto do cronograma foi empurrado 1 mês, o atraso medido em jan/2026.",
    ]);
    const sem = { ...D, base: "gastos" as const, atraso_meses: 0, etapas: [], totais: { ...D.totais, entregue_sem_pagamento: 5_000, sem_mes: 9_000 } };
    expect(avisos(sem)).toEqual([
      "Ainda sem medição: o avanço de cada etapa sai do que já foi gasto. Com as medições lançadas, a projeção passa a usar o executado e o ritmo da obra.",
      "R$ 50,00 de pedidos entregues sem pagamento registrado entram como devidos neste mês.",
      'R$ 90,00 de etapas fora do cronograma estão no "falta sair", mas sem mês.',
    ]);
  });

  it("a planilha traz os dois cenários e os totais, no formato do Excel brasileiro", () => {
    const linhas = csvDesembolso(D).replace(/^﻿/, "").trim().split("\r\n");
    expect(linhas[0]).toBe("Mês;Previsto no cronograma;Pago;Vai sair (ritmo de hoje);Vai sair (cronograma)");
    expect(linhas[3]).toBe("2026-03;0,00;0,00;1000,00;1500,00");
    expect(linhas).toContain("Falta sair;2700,00");
    const um = csvDesembolso({ ...D, base: "gastos" }).replace(/^﻿/, "").split("\r\n");
    expect(um[0]).toBe("Mês;Previsto no cronograma;Pago;Vai sair");
  });

  it("rótulo curto do eixo", () => {
    expect([curto(0), curto(25_000_000), curto(120_000_000), curto(9_900)]).toEqual(["0", "250 mil", "1,2 mi", "99"]);
  });
});

describe("desembolso: a seção", () => {
  it("mostra os números, a faixa do término e troca o cenário da tabela", async () => {
    criarRede({ "POST /srv/auth/renovar": renovarOk, "GET /srv/api/obras/o1/desembolso": () => json(D) });
    render(
      <ProvedorCasca usuario={USUARIO} demo={false}>
        <Desembolso obra={OBRA} />
      </ProvedorCasca>,
    );
    expect(await screen.findByText("R$ 2.700,00")).toBeTruthy();
    expect(screen.getByText(/Último pagamento entre abr\/2026/)).toBeTruthy();
    expect(screen.getByText("no orçado")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Ver mês a mês" }));
    const linhaMar = () => within(screen.getByRole("table")).getByRole("row", { name: /mar\/26/ });
    expect(within(linhaMar()).getByText("R$ 1.000,00")).toBeTruthy();         // no ritmo de hoje, o padrão
    await userEvent.click(screen.getByRole("radio", { name: "Se voltar ao cronograma" }));
    expect(within(linhaMar()).getByText("R$ 1.500,00")).toBeTruthy();
  });

  it("sem os dois cenários, não oferece a troca", async () => {
    criarRede({ "POST /srv/auth/renovar": renovarOk, "GET /srv/api/obras/o1/desembolso": () => json({ ...D, base: "gastos", termino_no_ritmo: "2026-04" }) });
    render(
      <ProvedorCasca usuario={USUARIO} demo={false}>
        <Desembolso obra={OBRA} />
      </ProvedorCasca>,
    );
    expect(await screen.findByText("Último pagamento previsto em abr/2026.")).toBeTruthy();
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });
});
