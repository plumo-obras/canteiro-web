import { describe, expect, it } from "vitest";
import {
  distanciaMeses,
  distribuirIgual,
  fmtMes,
  fmtPct,
  fmtReaisCurto,
  indiceDoMes,
  intervaloEtapa,
  listaMeses,
  previsaoMensal,
  previstoAte,
  redimensionar,
  situacaoEtapa,
  somarMes,
  somaPct,
} from "./cronograma";

describe("cronograma", () => {
  it("meses", () => {
    expect(somarMes("2026-11", 3)).toBe("2027-02");
    expect(somarMes("2026-01", -1)).toBe("2025-12");
    expect(distanciaMeses("2026-11", "2027-02")).toBe(3);
    expect(listaMeses("2026-11", 3)).toEqual(["2026-11", "2026-12", "2027-01"]);
    expect(fmtMes("2027-02")).toBe("fev/27");
    expect(fmtPct(1250)).toBe("12,5%");
    expect(fmtPct(10000)).toBe("100%");
  });

  it("distribuir igual fecha em 10000 exato, só no intervalo", () => {
    const d = distribuirIgual(10, 2, 4);
    expect(d).toEqual([0, 0, 3334, 3333, 3333, 0, 0, 0, 0, 0]);
    expect(somaPct(d)).toBe(10000);
    expect(somaPct(distribuirIgual(12, 0, 6))).toBe(10000);
    expect(distribuirIgual(3, 2, 0)).toEqual([3334, 3333, 3333]);
  });

  it("redimensionar mantém o preenchido e deixa os meses novos vazios", () => {
    expect(redimensionar([5000, 5000], 4)).toEqual([5000, 5000, 0, 0]);
    expect(redimensionar([5000, 3000, 2000], 2)).toEqual([5000, 3000]);
  });

  it("previsto por mês e acumulado", () => {
    const r = previsaoMensal(
      [
        { atual: 10_000_00, percentuais: [5000, 5000, 0] },
        { atual: 3_000_00, percentuais: [0, 3333, 6667] },
      ],
      3,
    );
    expect(r.previsto).toEqual([5_000_00, 5_000_00 + 99_990, 200_010]);
    expect(r.acumulado.at(-1)).toBe(13_000_00);
  });
});


describe("situação da etapa no Gantt", () => {
  const ps = [500, 2500, 4000, 3000, 0, 0]; // FUNDAÇÕES: 5, 25, 40, 30
  it("atrasada quando o medido fica abaixo do previsto acumulado até o mês da medição", () => {
    expect(situacaoEtapa(ps, 3000, 1)).toEqual({ situacao: "em_dia", previsto: 3000, falta: 0 });
    expect(situacaoEtapa(ps, 3000, 2)).toEqual({ situacao: "atrasada", previsto: 7000, falta: 4000 });
    expect(situacaoEtapa(ps, 10000, 2).situacao).toBe("concluida");
    expect(situacaoEtapa([0, 0, 5000, 5000], 0, 1).situacao).toBe("nao_comecou");
    expect(situacaoEtapa([0, 0, 5000, 5000], 1000, 1).situacao).toBe("em_dia"); // adiantada conta como em dia
    expect(situacaoEtapa(ps, 0, null).situacao).toBe("nao_comecou"); // sem medição
    expect(situacaoEtapa(ps, 9000, 9).situacao).toBe("atrasada"); // medição depois do término
  });
  it("auxiliares", () => {
    expect(previstoAte(ps, 2)).toBe(7000);
    expect(previstoAte(ps, -1)).toBe(0);
    expect(indiceDoMes("2026-11", "2026-12")).toBe(1);
    expect(intervaloEtapa(ps)).toEqual({ de: 0, ate: 3 });
    expect(intervaloEtapa([0, 0, 1000, 0, 9000, 0])).toEqual({ de: 2, ate: 4 });
    expect(intervaloEtapa([0, 0])).toBeNull();
    expect(fmtReaisCurto(19_276_831)).toBe("193 mil");
    expect(fmtReaisCurto(5_543_363)).toBe("55,4 mil");
    expect(fmtReaisCurto(124_000_000)).toBe("1,24 mi");
  });
});

import { colarBloco, textoSoma } from "./cronograma";
describe("editor do cronograma", () => {
  it("colar bloco do Excel a partir da célula focada", () => {
    const g = [
      ["", "", ""],
      ["", "", ""],
      ["", "", ""],
    ];
    expect(colarBloco(g, 1, 1, "40\t60%\n 25 \t75\n99\t99\n")).toEqual([
      ["", "", ""],
      ["", "40", "60"],
      ["", "25", "75"],
    ]);
    expect(colarBloco(g, 0, 2, "10\t20")).toEqual([["", "", "10"], ["", "", ""], ["", "", ""]]);
  });
  it("soma da linha", () => {
    expect(textoSoma(10000)).toEqual({ texto: "100%", ok: true });
    expect(textoSoma(8500)).toEqual({ texto: "85% · faltam 15", ok: false });
    expect(textoSoma(11000).texto).toBe("110% · sobram 10");
    expect(textoSoma(0).ok).toBe(true);
  });
});

import { valoresMes } from "./cronograma";
describe("R$ por mês pelo acumulado (como a API)", () => {
  it("fecha no orçado da etapa", () => {
    expect(valoresMes(10001, [3333, 3333, 3333, 1])).toEqual([3333, 3334, 3333, 1]);
    const vs = valoresMes(9_550_346, [500, 2500, 4000, 3000]);
    expect(vs.reduce((a, b) => a + b, 0)).toBe(9_550_346);
  });
});
