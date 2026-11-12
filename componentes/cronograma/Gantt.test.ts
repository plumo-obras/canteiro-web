import { describe, expect, it } from "vitest";
import type { Cronograma } from "@/lib/contrato";
import { barraDaEtapa } from "@/lib/cronograma";
import { filtroCelular, fracaoDoMes, rotuloMesGantt } from "./Gantt";
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
  it("Agora traz atrasadas (a maior falta primeiro) e em andamento; Próximas, as que não começaram; Todas, tudo", () => {
    const l = (n: string, situacao: "atrasada" | "em_dia" | "concluida" | "nao_comecou", falta = 0) => ({ n, situacao, falta });
    const ls = [l("a", "nao_comecou"), l("b", "em_dia"), l("c", "concluida"), l("d", "atrasada", 100), l("e", "atrasada", 900), l("f", "nao_comecou")];
    expect(filtroCelular(ls, "agora").map((x) => x.n)).toEqual(["e", "d", "b"]);
    expect(filtroCelular(ls, "proximas").map((x) => x.n)).toEqual(["a", "f"]);
    expect(filtroCelular(ls, "todas")).toHaveLength(6);
  });
});

describe("Gantt: marca de hoje", () => {
  it("cai no dia certo do mês, no fuso da obra", () => {
    // 1º de fevereiro 12h em São Paulo: meio do primeiro dia de 28
    expect(fracaoDoMes(new Date("2027-02-01T15:00:00Z"))).toBeCloseTo(0.5 / 28);
    // 00h30 UTC do dia 1º ainda é o último dia do mês anterior em São Paulo
    expect(fracaoDoMes(new Date("2026-12-01T00:30:00Z"))).toBeCloseTo(29.5 / 30);
  });
});

describe("Gantt: rótulos dos meses", () => {
  it("ano no 1º mês e em janeiro; alternando quando não cabe", () => {
    const ms = ["2026-11", "2026-12", "2027-01", "2027-02", "2027-03"];
    expect(ms.map((m, i) => rotuloMesGantt(m, i, false))).toEqual(["nov/26", "dez", "jan/27", "fev", "mar"]);
    expect(ms.map((m, i) => rotuloMesGantt(m, i, true))).toEqual(["nov/26", "", "jan/27", "", "mar"]);
  });
});
