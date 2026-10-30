import { describe, expect, it } from "vitest";
import { diaCurto, fmtDolares, fmtTokens, ultimosDias } from "./formato";

describe("formato da conta", () => {
  it("microdólares em dólares, sem float", () => {
    expect(fmtDolares(20_000_000)).toBe("US$ 20,00");
    expect(fmtDolares(1_234_567)).toBe("US$ 1,23");
    expect(fmtDolares(0)).toBe("US$ 0,00");
    expect(fmtDolares(3_000)).toBe("< US$ 0,01");
  });
  it("tokens por ordem de grandeza", () => {
    expect(fmtTokens(950)).toBe("950");
    expect(fmtTokens(12_400)).toBe("12 mil");
    expect(fmtTokens(1_250_000)).toBe("1,3 mi");
  });
  it("últimos 30 dias terminando hoje, no fuso de São Paulo", () => {
    const d = ultimosDias(30, new Date("2026-10-30T01:00:00Z")); // ainda dia 29 em São Paulo
    expect(d).toHaveLength(30);
    expect(d.at(-1)).toBe("2026-10-29");
    expect(d[0]).toBe("2026-09-30");
    expect(diaCurto("2026-10-03")).toBe("03/10");
  });
});
