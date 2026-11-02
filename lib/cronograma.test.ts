import { describe, expect, it } from "vitest";
import { distanciaMeses, distribuirIgual, fmtMes, fmtPct, listaMeses, previsaoMensal, redimensionar, somarMes, somaPct } from "./cronograma";

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
