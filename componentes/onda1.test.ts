import { describe, expect, it } from "vitest";
import type { Cronograma, EntradaRegistro, ResumoObra } from "@/lib/contrato";
import { pendenciasDe } from "./inicio/Inicio";
import { mostrarAutor } from "./Historico";
import { textoPrazo } from "./cronograma/Cronograma";

const resumo = (p: Partial<ResumoObra>): ResumoObra =>
  ({ obra: {} as ResumoObra["obra"], pendencias: 0, falta_comprar: 0, pedidos_abertos: 0, valor_pedidos_abertos: 0, nf_para_conferir: 0, ultima_atividade: null, ...p }) as ResumoObra;
const reg = (quem: string, origem = "tela"): EntradaRegistro => ({ id: quem + origem, quem, origem } as EntradaRegistro);

describe("Onda 1: zero não aparece, autor só quando muda, prazo numa frase", () => {
  it("Início mostra só pendências reais", () => {
    expect(pendenciasDe(resumo({}))).toEqual([]);
    expect(pendenciasDe(resumo({ pedidos_abertos: 1, valor_pedidos_abertos: 91000 })).map((p) => p.texto)).toEqual(["1 pedido a receber · R$ 910,00"]);
    expect(pendenciasDe(resumo({ pendencias: 2, falta_comprar: 1 })).map((p) => p.texto)).toEqual(["2 aprovações esperando você", "1 insumo a comprar"]);
  });

  it("Histórico: autor na 1ª linha, quando muda e sempre que é o agente", () => {
    expect(mostrarAutor(reg("Ana"), undefined)).toBe(true);
    expect(mostrarAutor(reg("Ana"), reg("Ana"))).toBe(false);
    expect(mostrarAutor(reg("Bia"), reg("Ana"))).toBe(true);
    expect(mostrarAutor(reg("Ana", "agente"), reg("Ana", "agente"))).toBe(true);
  });

  it("Cronograma: projetado só quando difere do contratual", () => {
    const c = (p: Partial<Cronograma["prazo"]>) =>
      ({ inicio: "2026-11", meses: 11, revisoes: 0, prazo: { termino_contratual: "2027-09", termino_projetado: "2027-09", atraso_meses: 0, atraso_decimos: 0, pct_previsto_na_medicao: 765, pct_medido: 765, mes_referencia: "2026-12", ...p } }) as Cronograma;
    expect(textoPrazo(c({}))).toMatchObject({ termina: "set/2027", contrato: null, medido: "7,65% medido", sit: { texto: "em dia" } });
    expect(textoPrazo(c({ termino_projetado: "2027-10", atraso_meses: 1, atraso_decimos: 8 }))).toMatchObject({ termina: "out/2027", contrato: "set/2027", sit: { texto: "0,8 mês de atraso" } });
    expect(textoPrazo(c({ termino_projetado: null, atraso_meses: null, pct_medido: null }))).toMatchObject({ termina: "set/2027", sit: null, medido: null });
  });
});

import { gruposCelular } from "./cronograma/Gantt";
describe("Onda 2: cronograma no celular", () => {
  it("atenção aberta em cima; concluídas e próximas recolhidas, só se houver", () => {
    const l = (situacao: "atrasada" | "em_dia" | "concluida" | "nao_comecou") => ({ situacao, medido_acumulado: 0, previstoRef: 0 });
    const g = gruposCelular([l("nao_comecou"), l("em_dia"), l("concluida"), l("atrasada"), l("nao_comecou")]);
    expect(g.map((x) => [x.k, x.itens.length, x.aberto])).toEqual([["atencao", 2, true], ["concluidas", 1, false], ["proximas", 2, false]]);
    expect(gruposCelular([l("nao_comecou")]).map((x) => x.k)).toEqual(["proximas"]);
  });
});

import { frasePrazo } from "./inicio/Inicio";
describe("Onda 2: prazo no cartão da Início", () => {
  const p = (x: object) => ({ termino_contratual: "2027-09", termino_projetado: "2027-09", atraso_meses: 0, atraso_decimos: 0, pct_previsto_na_medicao: 765, pct_medido: 765, mes_referencia: "2026-12", ...x });
  it("em dia, atraso com fração e sem medição", () => {
    expect(frasePrazo(p({}))).toEqual({ termina: "set/2027", sit: { texto: "em dia", tom: "ok" } });
    expect(frasePrazo(p({ termino_projetado: "2027-10", atraso_meses: 1, atraso_decimos: 8 }))).toEqual({ termina: "out/2027", sit: { texto: "0,8 mês de atraso", tom: "acima" } });
    expect(frasePrazo(p({ termino_projetado: null, atraso_meses: null, atraso_decimos: null })).sit).toBeNull();
  });
});
