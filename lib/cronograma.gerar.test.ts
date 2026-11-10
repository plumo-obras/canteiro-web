import { describe, expect, it } from "vitest";
import { CEM, faseDaEtapa, gerarCronograma, repartirMeses, somaPct, type EtapaParaGerar } from "./cronograma";

describe("gerar cronograma a partir do orçamento", () => {
  it("casa a etapa com a fase de obra pela descrição", () => {
    expect(faseDaEtapa("Fundação em sapata")).toBe(1);
    expect(faseDaEtapa("Estrutura")).toBe(2);
    expect(faseDaEtapa("Alvenaria de vedação")).toBe(3);
    expect(faseDaEtapa("Pintura látex")).toBe(8);
    expect(faseDaEtapa("Algo que não existe")).toBe(-1);
  });

  it("reparte os meses pelo valor, mínimo 1 cada, somando o total", () => {
    const d = repartirMeses([500, 300, 200], 10);
    expect(d.reduce((a, b) => a + b, 0)).toBe(10);
    expect(Math.min(...d)).toBeGreaterThanOrEqual(1);
    expect(d[0]!).toBeGreaterThan(d[2]!); // maior valor, mais meses
    // mais etapas que meses: 1 cada
    expect(repartirMeses([1, 1, 1, 1], 2)).toEqual([1, 1, 1, 1]);
  });

  it("ordena por fase (fundação → estrutura → acabamento) e cada etapa soma 100% nos seus meses", () => {
    const etapas: EtapaParaGerar[] = [
      { etapa: "1", descricao: "Acabamento e louças", atual: 100_000 },
      { etapa: "2", descricao: "Fundação", atual: 100_000 },
      { etapa: "3", descricao: "Estrutura", atual: 200_000 },
    ];
    const r = gerarCronograma(etapas, 6);
    // toda etapa: length = meses, e soma CEM
    for (const e of r) {
      expect(e.percentuais).toHaveLength(6);
      expect(somaPct(e.percentuais)).toBe(CEM);
    }
    const inicioDe = (etapa: string) => (r.find((x) => x.etapa === etapa)?.percentuais ?? []).findIndex((p) => p > 0);
    // fundação começa antes da estrutura, que começa antes do acabamento
    expect(inicioDe("2")).toBeLessThan(inicioDe("3"));
    expect(inicioDe("3")).toBeLessThan(inicioDe("1"));
  });

  it("sem etapas ou sem meses, devolve percentuais vazios sem quebrar", () => {
    expect(gerarCronograma([], 6)).toEqual([]);
    const r = gerarCronograma([{ etapa: "1", descricao: "Estrutura", atual: 100 }], 0);
    expect(r[0]!.percentuais).toEqual([]);
  });
});
