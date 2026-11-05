import { describe, expect, it } from "vitest";
import type { CampoRevisao, Revisao } from "@/lib/contrato";
import { corpoConfirmar, escolhaInicial, escolhasIniciais, fmtDia, hojeNaObra, pendencias, rotuloEtapa } from "./escolhas";

const campo = (estado: CampoRevisao["estado"], ...valores: (string | number)[]): CampoRevisao => ({
  estado,
  opcoes: valores.map((v) => ({ valor: v, rotulo: String(v), motivo: "lido", fornecedor_id: null })),
  escolhido: estado === "lido" ? 0 : null,
});

function revisao(parcial: Partial<Revisao> = {}): Revisao {
  return {
    valor: campo("lido", 35000),
    data_pagamento: campo("conferir", "2026-11-03", "2026-10-28"),
    favorecido: { estado: "lido", escolhido: 0, opcoes: [{ valor: "Elétrica Central", rotulo: "Elétrica Central", motivo: "CNPJ", fornecedor_id: "f1" }] },
    descricao: campo("vazio"),
    classificacao: { estado: "lido", escolhido: 0, opcoes: [{ etapa: "eletrica", topico_id: "t1", rotulo: "Elétrica › Quadro", motivo: "legenda" }] },
    tipo_documento: "comprovante_pix",
    situacao_pagamento: "pago",
    avisos: [],
    observacoes: null,
    ...parcial,
  };
}

const HOJE = "2026-11-05";

describe("o que vem escolhido", () => {
  it("lido vem marcado; dúvida, nada; em branco, a resposta própria", () => {
    expect(escolhaInicial(campo("lido", 1))).toBe(0);
    expect(escolhaInicial(campo("conferir", 1, 2))).toBeNull();
    expect(escolhaInicial(campo("vazio"))).toBe("propria");
  });
});

describe("o que falta para confirmar", () => {
  it("campo em dúvida e campo em branco seguram a confirmação", () => {
    const r = revisao();
    const e = escolhasIniciais(r);
    expect(pendencias(r, e, HOJE)).toEqual(["data do pagamento", "o que foi pago"]);
    expect(corpoConfirmar(r, e, HOJE)).toBeNull();
  });

  it("escolhida a opção e digitada a resposta própria, monta o corpo com fornecedor e tópico", () => {
    const r = revisao();
    const e = { ...escolhasIniciais(r), data: 1 as const };
    e.propria = { ...e.propria, descricao: "  mão de obra  " };
    expect(corpoConfirmar(r, e, HOJE)).toEqual({
      valor: 35000,
      data_pagamento: "2026-10-28",
      favorecido: "Elétrica Central",
      descricao: "mão de obra",
      etapa: "eletrica",
      topico_id: "t1",
      fornecedor_id: "f1",
      pedido_id: null,
    });
  });

  it("resposta própria troca a opção lida: valor digitado, etapa e tópico escolhidos à mão", () => {
    const r = revisao({ data_pagamento: campo("lido", "2026-11-03"), descricao: campo("lido", "fio") });
    const e = { ...escolhasIniciais(r), valor: "propria" as const, etapa: "propria" as const, favorecido: "propria" as const, pedido: "p1" };
    e.propria = { ...e.propria, valor: "1.234,56", etapa: "pisos", topico: "", favorecido: "Casa do João" };
    expect(corpoConfirmar(r, e, HOJE)).toMatchObject({
      valor: 123456,
      etapa: "pisos",
      topico_id: null,
      favorecido: "Casa do João",
      fornecedor_id: null,
      pedido_id: "p1",
    });
  });

  it("valor ilegível, zero e data no futuro não passam", () => {
    const r = revisao({ data_pagamento: campo("vazio"), descricao: campo("lido", "fio") });
    const e = { ...escolhasIniciais(r), valor: "propria" as const };
    e.propria = { ...e.propria, valor: "abc", data: "2026-11-06" };
    expect(pendencias(r, e, HOJE)).toEqual(["valor pago", "data do pagamento (não pode ser depois de hoje)"]);
    e.propria = { ...e.propria, valor: "0,00", data: "2026-11-05" };
    expect(pendencias(r, e, HOJE)).toEqual(["valor pago"]);
  });

  it("etapa própria sem escolher a etapa ainda falta", () => {
    const r = revisao({ classificacao: { estado: "vazio", escolhido: null, opcoes: [] } });
    const e = escolhasIniciais(r);
    expect(e.etapa).toBe("propria");
    expect(pendencias(r, e, HOJE)).toContain("etapa");
  });
});

describe("formatos", () => {
  it("dia sem fuso e hoje no fuso da obra", () => {
    expect(fmtDia("2026-11-03")).toBe("03/11/2026");
    // 01:30 em UTC ainda é dia 4 em São Paulo
    expect(hojeNaObra(new Date("2026-11-05T01:30:00Z"))).toBe("2026-11-04");
  });

  it("rótulo da etapa pela árvore, e pelo nome guardado quando já foi arquivada", () => {
    const arvore = [{ chave: "eletrica", nome: "Instalações elétricas", inclui: "", fixa: true, topicos: [{ id: "t1", nome: "Quadro" }] }];
    expect(rotuloEtapa(arvore, "eletrica", "t1")).toBe("Instalações elétricas › Quadro");
    expect(rotuloEtapa(arvore, "x-1", null, new Map([["x-1", "Muro"]]))).toBe("Muro");
  });
});
