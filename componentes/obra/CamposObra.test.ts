import { describe, expect, it } from "vitest";
import { dadosDe, formDe, lerMesAno, lerPct, mascararCep, pctParaCampo } from "./CamposObra";

describe("campos da obra", () => {
  it("CEP: máscara enquanto digita, colar com ou sem traço", () => {
    expect(mascararCep("9591")).toBe("9591");
    expect(mascararCep("95915")).toBe("95915");
    expect(mascararCep("959150")).toBe("95915-0");
    expect(mascararCep("95915000")).toBe("95915-000");
    expect(mascararCep("95.915-000 ")).toBe("95915-000");
    expect(mascararCep("959150001")).toBe("95915-000");
  });

  it("BDI em centésimos de ponto e data-base AAAA-MM", () => {
    expect(lerPct("22,91")).toBe(2291);
    expect(lerPct("22.91%")).toBe(2291);
    expect(lerPct("25")).toBe(2500);
    expect(lerPct("100,01")).toBeNull();
    expect(lerPct("abc")).toBeNull();
    expect(pctParaCampo(2291)).toBe("22,91");
    expect(pctParaCampo(2500)).toBe("25");
    expect(pctParaCampo(2290)).toBe("22,90");
    expect(lerMesAno("05/2025")).toBe("2025-05");
    expect(lerMesAno("5/2025")).toBe("2025-05");
    expect(lerMesAno("2025-05")).toBe("2025-05");
    expect(lerMesAno("13/2025")).toBeNull();
  });

  it("dadosDe leva nº do contrato, BDI e data-base nas unidades da API", () => {
    const f = { ...formDe(), nome: "EMEI", numero_contrato: " 012/2025 ", bdi: "22,91", data_base: "05/2025" };
    expect(dadosDe(f)).toMatchObject({ numero_contrato: "012/2025", bdi: 2291, data_base: "2025-05" });
    expect(formDe({ nome: "x", bdi: 2291, data_base: "2025-05", numero_contrato: "9" } as Parameters<typeof formDe>[0])).toMatchObject({ bdi: "22,91", data_base: "05/2025", numero_contrato: "9" });
  });
});
