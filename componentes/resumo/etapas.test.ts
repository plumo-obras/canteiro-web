import { describe, expect, it } from "vitest";
import type { Obra, ResumoDaObra } from "@/lib/contrato";
import { etapasDaObra, reaisCurto } from "./etapas";

const obra = (status: Obra["status"]): Obra => ({ id: "o1", nome: "Casa", status }) as unknown as Obra;
const resumo = (o: Obra, f: Partial<ResumoDaObra["financeiro"]> = {}, c: Partial<ResumoDaObra["cronograma"]> = {}, extra: Partial<ResumoDaObra> = {}): ResumoDaObra => ({
  obra: o,
  financeiro: { tem_orcamento: false, orcado_atual: 0, comprometido: 0, realizado: 0, saldo: 0, ...f },
  cronograma: { cadastrado: false, termino_contratual: null, termino_projetado: null, atraso_decimos: null, ...c },
  ...extra,
});
/** "Projeto:feita ok" … uma etapa por linha, fácil de ler no erro. */
const API = { demo: false, semPedidos: false };
const DEMO = { demo: true, semPedidos: false };
const SEM_PEDIDOS = { demo: true, semPedidos: true };
const linha = (o: Obra, r: ResumoDaObra | null, modo = API) => etapasDaObra(o, r, modo)?.map((e) => `${e.rotulo}:${e.estado}${e.detalhe ? ` ${e.detalhe}` : ""}`);

describe("etapasDaObra", () => {
  it("sem o resumo desta obra não afirma nada", () => {
    const o = obra("em_andamento");
    expect(etapasDaObra(o, null, API)).toBeNull();
    expect(etapasDaObra(o, resumo({ ...o, id: "outra" } as Obra), API)).toBeNull();
  });

  it("sem orçamento: começa pelo projeto, o resto vem depois", () => {
    const o = obra("em_orcamento");
    expect(linha(o, resumo(o))).toEqual(["Projeto:atual comece por aqui", "Orçamento:depois", "Cronograma:depois", "Compras:depois", "Gastos:depois"]);
  });

  it("orçamento montado e ainda não aprovado: a etapa é o Orçamento", () => {
    const o = obra("em_orcamento");
    expect(linha(o, resumo(o, { tem_orcamento: true, orcado_atual: 48_230_000 }))).toEqual(["Projeto:feita ok", "Orçamento:atual para aprovar", "Cronograma:depois", "Compras:depois", "Gastos:depois"]);
  });

  it("cronograma gerado ainda no orçamento já conta como feito", () => {
    const o = obra("em_orcamento");
    expect(linha(o, resumo(o, { tem_orcamento: true }, { cadastrado: true, termino_contratual: "2027-06" }))?.[2]).toBe("Cronograma:feita término jun/27");
  });

  it("aprovada sem cronograma: falta montar o cronograma, e a execução já anda", () => {
    const o = obra("em_andamento");
    expect(linha(o, resumo(o, { tem_orcamento: true, orcado_atual: 48_230_000, realizado_pct: 2460 }))).toEqual([
      "Projeto:feita ok",
      "Orçamento:feita R$ 482 mil aprovado",
      "Cronograma:atual falta montar",
      "Compras:atual em andamento",
      "Gastos:atual 24,6% do orçado",
    ]);
  });

  it("aprovada com cronograma: término projetado manda mais que o contratual", () => {
    const o = obra("em_andamento");
    expect(linha(o, resumo(o, { tem_orcamento: true }, { cadastrado: true, termino_contratual: "2027-06", termino_projetado: "2027-07" }))?.[2]).toBe("Cronograma:feita término jul/27");
  });

  it("entrega atrasada e etapa estourada pedem atenção", () => {
    const o = obra("em_andamento");
    const r = resumo(o, { tem_orcamento: true, realizado_pct: 10_800, etapas_estouradas: [{}] }, { cadastrado: true }, { entregas: { atrasadas: [{}, {}] } });
    expect(linha(o, r)?.slice(3)).toEqual(["Compras:atencao 2 entregas atrasadas", "Gastos:atencao 108% do orçado · 1 etapa estourada"]);
  });

  it("concluída: tudo feito", () => {
    const o = obra("concluida");
    expect(etapasDaObra(o, resumo(o, { tem_orcamento: true }, { cadastrado: true }), API)?.every((e) => e.estado === "feita")).toBe(true);
  });

  it("desfazendo a aprovação: o Orçamento pede atenção e a execução para", () => {
    const o = obra("desfazendo_aprovacao");
    expect(linha(o, resumo(o, { tem_orcamento: true }))).toEqual(["Projeto:feita ok", "Orçamento:atencao desfazendo a aprovação", "Cronograma:depois", "Compras:depois", "Gastos:depois"]);
  });

  it("na demonstração, sem Gastos", () => {
    const o = obra("em_andamento");
    expect(etapasDaObra(o, resumo(o, { tem_orcamento: true }), DEMO)?.map((e) => e.tela)).toEqual(["projeto", "orcamento", "cronograma", "suprimentos"]);
    // Na versão sem pedidos, Compras sai e Gastos (que a demo dela tem) entra.
    expect(etapasDaObra(o, resumo(o, { tem_orcamento: true }), SEM_PEDIDOS)?.map((e) => e.tela)).toEqual(["projeto", "orcamento", "cronograma", "gastos"]);
  });
});

describe("reaisCurto", () => {
  it("mostra só a ordem de grandeza", () => {
    expect(reaisCurto(48_230_000)).toBe("R$ 482 mil");
    expect(reaisCurto(125_000_000)).toBe("R$ 1,3 mi");
    expect(reaisCurto(45_000)).toBe("R$ 450");
  });
});
