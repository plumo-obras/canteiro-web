import { describe, expect, it } from "vitest";
import type { Cronograma } from "@/lib/contrato";
import { textoPrazo } from "./Cronograma";

describe("Cronograma: prazo numa frase", () => {
  it("projetado só quando difere do contratual", () => {
    const c = (p: Partial<Cronograma["prazo"]>) =>
      ({ inicio: "2026-11", meses: 11, revisoes: 0, prazo: { termino_contratual: "2027-09", termino_projetado: "2027-09", atraso_meses: 0, atraso_decimos: 0, pct_previsto_na_medicao: 765, pct_medido: 765, mes_referencia: "2026-12", ...p } }) as Cronograma;
    expect(textoPrazo(c({}))).toMatchObject({ termina: "set/2027", contrato: null, medido: "7,65% medido", sit: { texto: "em dia" } });
    expect(textoPrazo(c({ termino_projetado: "2027-10", atraso_meses: 1, atraso_decimos: 8 }))).toMatchObject({ termina: "out/2027", contrato: "set/2027", sit: { texto: "0,8 mês de atraso" } });
    expect(textoPrazo(c({ termino_projetado: null, atraso_meses: null, pct_medido: null }))).toMatchObject({ termina: "set/2027", sit: null, medido: null });
  });
});
