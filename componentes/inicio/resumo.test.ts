import { describe, expect, it } from "vitest";
import type { ResumoObra } from "@/lib/contrato";
import { frasePrazo, pendenciasDe } from "./Inicio";

const resumo = (p: Partial<ResumoObra>): ResumoObra =>
  ({ obra: {} as ResumoObra["obra"], pendencias: 0, falta_comprar: 0, pedidos_abertos: 0, valor_pedidos_abertos: 0, nf_para_conferir: 0, ultima_atividade: null, ...p }) as ResumoObra;

describe("Início: pendências do cartão", () => {
  it("Início mostra só pendências reais", () => {
    expect(pendenciasDe(resumo({}))).toEqual([]);
    expect(pendenciasDe(resumo({ pedidos_abertos: 1, valor_pedidos_abertos: 91000 })).map((p) => p.texto)).toEqual(["1 pedido a receber · R$ 910,00"]);
    expect(pendenciasDe(resumo({ pendencias: 2, falta_comprar: 1 })).map((p) => p.texto)).toEqual(["2 aprovações esperando você", "1 insumo a comprar"]);
  });
});

describe("Início: prazo no cartão", () => {
  const p = (x: object) => ({ termino_contratual: "2027-09", termino_projetado: "2027-09", atraso_meses: 0, atraso_decimos: 0, pct_previsto_na_medicao: 765, pct_medido: 765, mes_referencia: "2026-12", ...x });
  it("em dia, atraso com fração e sem medição", () => {
    expect(frasePrazo(p({}))).toEqual({ termina: "set/2027", sit: { texto: "em dia", tom: "ok" } });
    expect(frasePrazo(p({ termino_projetado: "2027-10", atraso_meses: 1, atraso_decimos: 8 }))).toEqual({ termina: "out/2027", sit: { texto: "0,8 mês de atraso", tom: "acima" } });
    expect(frasePrazo(p({ termino_projetado: null, atraso_meses: null, atraso_decimos: null })).sit).toBeNull();
  });
});
