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

  it("Ver depois lança sem etapa e sem tópico, e não fica como pendência", () => {
    const r = revisao({ classificacao: { estado: "conferir", escolhido: null, opcoes: [] } } as Partial<Revisao>);
    const e = { ...escolhasIniciais(r), data: 1 as const, etapa: "depois" as const };
    e.propria = { ...e.propria, descricao: "tubos" };
    expect(pendencias(r, e, HOJE)).toEqual([]);
    expect(corpoConfirmar(r, e, HOJE)).toMatchObject({ etapa: null, topico_id: null });
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

import { arquivadosDoResumo, foraDoOrcamento, lidoNaFila, nomeComCodigo, nomeCurto, nomeSemCodigo, origemDaArvore } from "./escolhas";
import { normalizarArvore } from "@/lib/cliente";

describe("o que a IA leu, na fila", () => {
  it("valor em reais, quem recebeu, a data e se ficou dúvida", () => {
    const l = lidoNaFila({
      valor: { certeza: "alta", opcoes: [{ valor: "1.284,90" }] },
      favorecido: { certeza: "alta", opcoes: [{ valor: "Loja Fictícia" }] },
      data_pagamento: { certeza: "baixa", opcoes: [{ valor: "2026-11-05" }, { valor: "2026-11-04" }] },
      descricao: { certeza: "alta", opcoes: [] },
    });
    expect(l).toEqual({ valor: "R$ 1.284,90", favorecido: "Loja Fictícia", data: "05/11/2026", descricao: null, duvida: true });
  });
  it("leitura em branco, ausente ou em formato estranho não quebra: fica sem resumo", () => {
    expect(lidoNaFila(null)).toBeNull();
    expect(lidoNaFila({ valor: { certeza: "alta", opcoes: [] } })).toBeNull();
    expect(lidoNaFila({ valor: "350" })).toBeNull();
    expect(lidoNaFila({ valor: { certeza: "alta", opcoes: [{ valor: "trezentos" }] } })!.valor).toBe("trezentos");
  });
});

describe("árvore da opção 2 (etapas do orçamento)", () => {
  const padrao = [{ chave: "eletrica", nome: "Instalações elétricas", inclui: "", fixa: true, topicos: [] }];
  it("lista de hoje, sem origem: padrão; {origem, etapas} no topo desce para cada etapa", () => {
    expect(origemDaArvore(normalizarArvore(padrao))).toBe("padrao");
    const orc = normalizarArvore({ origem: "orcamento", etapas: [{ chave: "18", nome: "INSTALAÇÃO ELÉTRICA - 220V", inclui: "", fixa: true }] });
    expect(orc[0]).toMatchObject({ origem: "orcamento", topicos: [] });
    expect(origemDaArvore(orc)).toBe("orcamento");
    expect(origemDaArvore(normalizarArvore([{ ...padrao[0], chave: "3", origem: "orcamento" }]))).toBe("orcamento");
    expect(normalizarArvore({ algo: 1 })).toEqual([]);
  });
  it("código + descrição só na etapa do orçamento", () => {
    expect(nomeComCodigo({ chave: "18", nome: "INSTALAÇÃO ELÉTRICA - 220V", origem: "orcamento" })).toBe("18 · INSTALAÇÃO ELÉTRICA - 220V");
    expect(nomeComCodigo({ chave: "x", codigo: "3.1", nome: "Sapatas", origem: "orcamento" })).toBe("3.1 · Sapatas");
    // a árvore mostra o código à parte: a descrição que já começa por ele não o repete ("3 3 FUNDAÇÕES")
    expect(nomeSemCodigo({ chave: "3", nome: "3 FUNDAÇÕES", origem: "orcamento" })).toBe("FUNDAÇÕES");
    expect(nomeSemCodigo({ chave: "18.2", nome: "18.2 - Quadro", origem: "orcamento" })).toBe("Quadro");
    expect(nomeSemCodigo({ chave: "1", nome: "10 PINTURA", origem: "orcamento" })).toBe("10 PINTURA");
    expect(nomeSemCodigo({ chave: "3", nome: "FUNDAÇÕES", origem: "orcamento" })).toBe("FUNDAÇÕES");
    expect(nomeSemCodigo({ chave: "eletrica", nome: "Instalações elétricas" })).toBe("Instalações elétricas");
    expect(nomeComCodigo({ chave: "eletrica", nome: "Instalações elétricas" })).toBe("Instalações elétricas");
    expect(nomeComCodigo({ chave: "x-e1", nome: "Piscina", origem: "orcamento" })).toBe("Piscina");
  });
  it("nome curto para o aviso: código · sigla, sem repetir o código", () => {
    const spda = { chave: "22", nome: "22 SISTEMA DE PROTEÇÃO CONTRA DESCARGAS ATMOSFÉRICAS (SPDA)", origem: "orcamento" as const };
    expect(nomeCurto(spda)).toBe("22 · SPDA");
    expect(nomeCurto({ chave: "3", nome: "3 FUNDAÇÕES", origem: "orcamento" })).toBe("3 · FUNDAÇÕES");
    expect(nomeCurto({ chave: "18", nome: "INSTALAÇÃO ELÉTRICA - 220V", origem: "orcamento" })).toBe("18 · INSTALAÇÃO ELÉTRICA - 220V");
    expect(nomeCurto({ chave: "eletrica", nome: "Instalações elétricas" })).toBe("Instalações elétricas");
  });
  it("gasto fora da árvore do orçamento é 'sem etapa do orçamento'; na árvore padrão, nunca", () => {
    const orc = normalizarArvore({ origem: "orcamento", etapas: [{ chave: "3", nome: "FUNDAÇÕES", inclui: "", fixa: true, topicos: [] }] });
    expect(foraDoOrcamento(orc, "fundacao")).toBe(true);
    expect(foraDoOrcamento(orc, "3")).toBe(false);
    expect(foraDoOrcamento(orc, "x-e1")).toBe(false);
    expect(foraDoOrcamento(normalizarArvore(padrao), "fundacao")).toBe(false);
  });
});

describe("arquivados (pelo resumo)", () => {
  it("etapa extra fora da árvore e tópico fora da etapa ativa; etapa fixa nunca", () => {
    const arvore = [{ chave: "eletrica", nome: "Elétrica", inclui: "", fixa: true, topicos: [{ id: "t1", nome: "Quadro" }] }];
    const resumo = {
      etapas: [
        { etapa: "eletrica", nome: "Elétrica", topicos: [{ topico_id: "t1", nome: "Quadro" }, { topico_id: "t2", nome: "Sapatas" }, { topico_id: null, nome: "Sem tópico" }] },
        { etapa: "x-e2", nome: "Aterro", topicos: [{ topico_id: "t3", nome: "Dentro do aterro" }] },
        { etapa: "fundacao", nome: "Fundação", topicos: [] },
      ],
    };
    expect(arquivadosDoResumo(arvore, resumo)).toEqual([
      { tipo: "topico", id: "t2", nome: "Sapatas", etapaNome: "Elétrica" },
      { tipo: "etapa", id: "e2", nome: "Aterro", etapaNome: "Aterro" },
    ]);
    expect(arquivadosDoResumo(arvore, null)).toEqual([]);
  });
});
