import { describe, expect, it } from "vitest";
import type { Cronograma } from "@/lib/contrato";
import { barraDaEtapa } from "@/lib/cronograma";
import { gruposCelular, rotuloMesGantt } from "./Gantt";
import { linhasTabela } from "./Tabela";

describe("Gantt com barra única e tabela físico-financeira", () => {
  it("a barra vai do primeiro ao último mês com %, com as pausas no meio e a fração medida", () => {
    expect(barraDaEtapa([0, 2500, 0, 0, 7500, 0], 3000)).toEqual({ de: 1, ate: 4, pausas: [2, 3], medida: 0.3 });
    expect(barraDaEtapa([5000, 5000], 12000)!.medida).toBe(1);
    expect(barraDaEtapa([0, 0], 0)).toBeNull();
  });
  it("a tabela traz só as etapas do cronograma, com o R$ de cada mês cheio", () => {
    const c = { etapas: [{ etapa: "3", descricao: "FUNDAÇÕES", atual: 9_550_346, percentuais: [500, 2500, 4000, 3000], medido_acumulado: 0 }, { etapa: "9", descricao: "X", atual: 100, percentuais: [0, 0, 0, 0], medido_acumulado: 0 }] } as unknown as Cronograma;
    const t = linhasTabela(c);
    expect(t.map((l) => l.etapa)).toEqual(["3"]);
    expect(t[0]!.meses.map((m) => m.valor)).toEqual([477_517, 2_387_587, 3_820_138, 2_865_104]);
  });
});

describe("Gantt no celular", () => {
  it("atenção aberta em cima; concluídas e próximas recolhidas, só se houver", () => {
    const l = (situacao: "atrasada" | "em_dia" | "concluida" | "nao_comecou") => ({ situacao, medido_acumulado: 0, previstoRef: 0 });
    const g = gruposCelular([l("nao_comecou"), l("em_dia"), l("concluida"), l("atrasada"), l("nao_comecou")]);
    expect(g.map((x) => [x.k, x.itens.length, x.aberto])).toEqual([["atencao", 2, true], ["concluidas", 1, false], ["proximas", 2, false]]);
    expect(gruposCelular([l("nao_comecou")]).map((x) => x.k)).toEqual(["proximas"]);
  });
});

describe("Gantt: rótulos dos meses", () => {
  it("ano no 1º mês e em janeiro; alternando quando não cabe", () => {
    const ms = ["2026-11", "2026-12", "2027-01", "2027-02", "2027-03"];
    expect(ms.map((m, i) => rotuloMesGantt(m, i, false))).toEqual(["nov/26", "dez", "jan/27", "fev", "mar"]);
    expect(ms.map((m, i) => rotuloMesGantt(m, i, true))).toEqual(["nov/26", "", "jan/27", "", "mar"]);
  });
});
