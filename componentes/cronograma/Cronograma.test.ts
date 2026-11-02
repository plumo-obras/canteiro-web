import { describe, expect, it } from "vitest";
import type { PrazoCronograma } from "@/lib/contrato";
import { situacaoPrazo } from "./Cronograma";

const prazo = (atraso: number | null, decimos?: number): PrazoCronograma => ({
  termino_contratual: "2027-08", termino_projetado: null, atraso_meses: atraso, atraso_decimos: decimos, pct_previsto_na_medicao: null, pct_medido: null, mes_referencia: null,
});

describe("situação do prazo", () => {
  it("atraso, em dia, adiantada e sem medição", () => {
    expect(situacaoPrazo(prazo(3))).toEqual({ texto: "3 meses de atraso", tom: "acima" });
    expect(situacaoPrazo(prazo(1))!.texto).toBe("1 mês de atraso");
    expect(situacaoPrazo(prazo(0))).toEqual({ texto: "em dia", tom: "ok" });
    expect(situacaoPrazo(prazo(-2))!.texto).toBe("adiantada 2 meses");
    expect(situacaoPrazo(prazo(null))).toBeNull();
    expect(situacaoPrazo(prazo(1, 14))!.texto).toBe("1,4 mês de atraso");
    expect(situacaoPrazo(prazo(1, 8))!.texto).toBe("0,8 mês de atraso");
    expect(situacaoPrazo(prazo(2, 20))!.texto).toBe("2 meses de atraso");
    expect(situacaoPrazo(prazo(3, 25))!.texto).toBe("2,5 meses de atraso");
    expect(situacaoPrazo(prazo(-1, -5))).toEqual({ texto: "adiantada 0,5 mês", tom: "ok" });
    expect(situacaoPrazo(prazo(0, 0))!.texto).toBe("em dia");
  });
});
