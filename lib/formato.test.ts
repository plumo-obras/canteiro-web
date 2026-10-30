import { describe, expect, it } from "vitest";
import { fmtDiaHora, fmtHora, fmtQtd, fmtQtdUn, fmtReais } from "./formato";

describe("fmtQtd (milésimos → pt-BR), igual a canteiro_dominio.tipos.fmt_qtd", () => {
  it.each([
    [1500, "1,5"],
    [2_760_000, "2.760"],
    [0, "0"],
    [1, "0,001"],
    [1_234_567_890, "1.234.567,89"],
    [3_940_000, "3.940"],
  ])("%i → %s", (m, s) => expect(fmtQtd(m)).toBe(s));

  it("mantém o sinal abaixo de 1 (ajuste negativo de contagem)", () => {
    expect(fmtQtd(-500)).toBe("-0,5");
    expect(fmtQtd(-190_000)).toBe("-190");
  });

  it("junta a unidade", () => expect(fmtQtdUn(40_000, "m³")).toBe("40 m³"));
});

describe("fmtReais (centavos → pt-BR)", () => {
  it.each([
    [129_990, "R$ 1.299,90"],
    [5, "R$ 0,05"],
    [0, "R$ 0,00"],
    [2_112_000, "R$ 21.120,00"],
    [-4_680_00, "-R$ 4.680,00"],
  ])("%i → %s", (c, s) => expect(fmtReais(c)).toBe(s));
});

describe("hora no fuso de São Paulo", () => {
  it("formata independente do fuso do navegador", () => {
    expect(fmtHora("2026-10-30T13:32:00Z")).toBe("10:32");
    expect(fmtDiaHora("2026-10-30T13:32:00Z")).toBe("30/10 10:32");
  });
});
