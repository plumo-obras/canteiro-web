import { beforeEach, describe, expect, it } from "vitest";
import type { Comprovante, ComprovanteDetalhe, EtapaNaArvore, GastoObra, HojeNaObra, Orcamento, ResumoDaObra, ResumoGastos } from "../contrato";
import { arquivoComprovanteDemo, desfazer, lerComprovanteDemo, reiniciarDemo, responder } from "./loja";
import { roteiroDemo } from "./agente";

let e: ReturnType<typeof reiniciarDemo>;
const admin = () => e.usuarios[0]!;
const leitura = () => e.usuarios[1]!;
const casa = () => e.obras.find((o) => o.nome === "Casa Vila Nova")!;
const chamar = (m: string, caminho: string, corpo?: unknown, u = admin()) => {
  const [p, q = ""] = caminho.split("?");
  return responder(m, p!.split("/").filter(Boolean), new URLSearchParams(q), corpo, u);
};
/** Um PNG de 1×1 de verdade: o tipo sai dos bytes, não do nome. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0x1f, 0x15, 0xc4, 0x89]);
const png = (extra = 0) => new Uint8Array([...PNG, extra]);
const enviar = (bytes: Uint8Array, legenda = "", u = admin(), obra = casa().id) =>
  chamar("POST", `obras/${obra}/comprovantes`, { arquivo: { nome: "foto.png", texto: "", bytes }, legenda }, u);
const orcamento = () => chamar("GET", `obras/${casa().id}/orcamento`).corpo as Orcamento;
const arvore = (obra = casa().id) => chamar("GET", `obras/${obra}/arvore`).corpo as EtapaNaArvore[];
const corpoConfirmar = (etapa: string | null, valor = 35_000) => ({ valor, data_pagamento: "2026-01-10", favorecido: "João da Silva", descricao: "Diária de pedreiro", etapa });

describe("demonstração: gastos na demo de hoje", () => {
  beforeEach(() => {
    e = reiniciarDemo();
  });

  it("a árvore é a do orçamento vigente; obra sem orçamento usa a lista padrão, com as extras antes de Outros", () => {
    expect(arvore()).toHaveLength(12);
    expect(arvore()[2]).toEqual(expect.objectContaining({ chave: "3", nome: "3 Estrutura", origem: "orcamento", fixa: true }));
    const sem = e.obras.find((o) => o.nome === "Sobrado Jardim Europa")!;
    expect(chamar("POST", `obras/${sem.id}/etapas-extras`, { nome: "Paisagismo" }).status).toBe(201);
    const a = arvore(sem.id);
    expect(a).toHaveLength(25);
    expect(a.at(-2)).toMatchObject({ nome: "Paisagismo", origem: "extra", fixa: false });
    expect(a.at(-1)).toMatchObject({ chave: "outros", origem: "padrao" });
  });

  it("o comprovante entra por qualquer papel; o mesmo arquivo devolve o mesmo; formato e tamanho seguem o contrato", () => {
    const r = enviar(png(), "", leitura());
    expect(r.status).toBe(201);
    expect(r.corpo).toMatchObject({ status: "a_revisar", tipo_conteudo: "image/png", quem: "Paula (leitura)", ja_existia: false });
    const de_novo = enviar(png());
    expect(de_novo.status).toBe(200);
    expect(de_novo.corpo).toMatchObject({ id: (r.corpo as Comprovante).id, ja_existia: true });
    expect(enviar(new TextEncoder().encode("não é foto")).status).toBe(422);
    expect(enviar(new Uint8Array([...PNG, ...new Uint8Array(3_500_001)])).status).toBe(413);
    expect(arquivoComprovanteDemo((r.corpo as Comprovante).id)).toMatchObject({ tipo: "image/png" });
  });

  it("a leitura simulada preenche a revisão pela legenda: lida com certeza, ou com opções e nada marcado na dúvida", () => {
    const c = enviar(png(1), "cimento da laje").corpo as Comprovante;
    lerComprovanteDemo(c.id);
    const d = chamar("GET", `comprovantes/${c.id}`).corpo as ComprovanteDetalhe;
    expect(d.revisao.descricao).toMatchObject({ estado: "lido", escolhido: 0, opcoes: [expect.objectContaining({ valor: "Cimento CP-II 50 kg (40 sc)" })] });
    // a etapa sugerida existe na árvore de hoje (as etapas do orçamento da Casa Vila Nova)
    const chaves = new Set(arvore().map((n) => n.chave));
    expect(d.revisao.classificacao.opcoes.length).toBeGreaterThan(0);
    expect(d.revisao.classificacao.opcoes.every((o) => chaves.has(o.etapa))).toBe(true);
    expect(d.revisao.valor.opcoes[0]).toMatchObject({ valor: 156_000, rotulo: "R$ 1.560,00" });
  });

  it("confirmar cria o gasto, soma no gasto da etapa e o Desfazer estorna e devolve o comprovante para a fila", () => {
    const antes = orcamento();
    const nGastos = (chamar("GET", `obras/${casa().id}/gastos`).corpo as GastoObra[]).length;
    const c = enviar(png(2)).corpo as Comprovante;
    expect(chamar("POST", `comprovantes/${c.id}/confirmar`, corpoConfirmar("3"), leitura()).status).toBe(403);
    expect(chamar("POST", `comprovantes/${c.id}/confirmar`, corpoConfirmar("99")).status).toBe(422);
    expect(chamar("POST", `comprovantes/${c.id}/confirmar`, { ...corpoConfirmar("3"), data_pagamento: "2999-01-01" }).status).toBe(422);
    const r = chamar("POST", `comprovantes/${c.id}/confirmar`, corpoConfirmar("3"));
    expect(r.status).toBe(201);
    const { gasto, registro_id } = r.corpo as { gasto: GastoObra; registro_id: string };
    expect(gasto).toMatchObject({ valor: 35_000, etapa: "3", etapa_nome: "3 Estrutura", etapa_origem: "orcamento", estornado: false });
    const depois = orcamento();
    expect(depois.etapas[2]!.gasto - antes.etapas[2]!.gasto).toBe(35_000);
    expect(depois.totais.gasto - antes.totais.gasto).toBe(35_000);
    expect(chamar("POST", `comprovantes/${c.id}/confirmar`, corpoConfirmar("3")).status).toBe(409);
    expect(e.registro.find((x) => x.id === registro_id)!.texto).toBe("Gasto de R$ 350,00 em 3 Estrutura: Diária de pedreiro (João da Silva)");

    desfazer(registro_id, admin());
    expect(orcamento().totais.gasto).toBe(antes.totais.gasto);
    expect((chamar("GET", `obras/${casa().id}/comprovantes?status=a_revisar`).corpo as Comprovante[]).find((x) => x.id === c.id)).toMatchObject({ gasto_id: null });
    expect(chamar("GET", `obras/${casa().id}/gastos`).corpo).toHaveLength(nGastos);
  });

  it("ver depois: sem etapa conta na obra e em nenhuma etapa; mudar a etapa leva para ela e o Desfazer volta", () => {
    const antes = orcamento();
    const aDefinir = (chamar("GET", `obras/${casa().id}/gastos/resumo`).corpo as ResumoGastos).a_definir!;
    const c = enviar(png(3)).corpo as Comprovante;
    const { gasto } = chamar("POST", `comprovantes/${c.id}/confirmar`, corpoConfirmar(null)).corpo as { gasto: GastoObra };
    expect(orcamento().totais.sem_etapa.gasto - antes.totais.sem_etapa.gasto).toBe(35_000);
    expect((chamar("GET", `obras/${casa().id}/gastos/resumo`).corpo as ResumoGastos).a_definir).toBe(aDefinir + 35_000);
    expect(chamar("PATCH", `gastos/${gasto.id}`, { etapa: "3" }, leitura()).status).toBe(403);
    const r = chamar("PATCH", `gastos/${gasto.id}`, { etapa: "3" });
    expect(r.corpo).toMatchObject({ etapa: "3", etapa_nome: "3 Estrutura" });
    expect(chamar("PATCH", `gastos/${gasto.id}`, { etapa: "3" }).corpo).toEqual({ detail: "Nada mudou." });
    expect(orcamento().etapas[2]!.gasto - antes.etapas[2]!.gasto).toBe(35_000);
    desfazer((r.corpo as { registro_id: string }).registro_id, admin());
    expect(orcamento().etapas[2]!.gasto).toBe(antes.etapas[2]!.gasto);
  });

  it("descartar tira da fila e o Desfazer reabre", () => {
    const c = enviar(png(4)).corpo as Comprovante;
    const r = chamar("POST", `comprovantes/${c.id}/descartar`, { motivo: "foto repetida" });
    expect(r.corpo).toMatchObject({ status: "descartado", motivo_descarte: "foto repetida" });
    desfazer((r.corpo as { registro_id: string }).registro_id, admin());
    expect(chamar("GET", `comprovantes/${c.id}`).corpo).toMatchObject({ status: "a_revisar", motivo_descarte: "" });
  });

  it("etapa extra e tópico: nome único, limites do contrato e o Desfazer da criação arquiva", () => {
    expect(chamar("POST", `obras/${casa().id}/etapas-extras`, { nome: "Estrutura" }).corpo).toEqual({ detail: "Já existe: Estrutura." });
    expect(chamar("POST", `obras/${casa().id}/etapas-extras`, { nome: "Taxas" }, leitura()).status).toBe(403);
    const x = chamar("POST", `obras/${casa().id}/etapas-extras`, { nome: "Taxas e cartório" }).corpo as { chave: string; registro_id: string };
    const t = chamar("POST", `obras/${casa().id}/topicos`, { etapa: x.chave, nome: "Alvará" });
    expect(t.status).toBe(201);
    expect(chamar("POST", `obras/${casa().id}/topicos`, { etapa: x.chave, nome: "alvara" }).status).toBe(422);
    expect(arvore().find((n) => n.chave === x.chave)!.topicos).toEqual([expect.objectContaining({ nome: "Alvará", origem: "manual" })]);
    desfazer(x.registro_id, admin());
    expect(arvore().some((n) => n.chave === x.chave)).toBe(false);
  });
});

describe("demonstração: a Casa Vila Nova em Orçamento, Cronograma e Gastos", () => {
  beforeEach(() => {
    e = reiniciarDemo();
  });

  it("a Casa Vila Nova nasce sem proposta, com o orçamento da obra inteira por etapas", () => {
    expect(e.propostas).toHaveLength(0);
    const o = orcamento();
    expect(o.etapas.map((x) => x.descricao)).toEqual([
      "Serviços preliminares", "Fundação", "Estrutura", "Alvenaria", "Cobertura", "Instalações elétricas",
      "Instalações hidrossanitárias", "Revestimentos", "Pisos", "Esquadrias", "Pintura", "Limpeza e entrega",
    ]);
    // a Fundação passou do orçado: é o que o Resumo e o Hoje têm para avisar
    expect(o.etapas.filter((x) => x.estourou).map((x) => x.descricao)).toEqual(["Fundação"]);
    expect(e.registro.every((r) => !/PED-|insumo|Saída de/.test(r.texto) || r.obra_id !== casa().id)).toBe(true);
  });

  it("o mesmo dinheiro em todas as telas: orçamento, resumo dos gastos, resumo da obra e desembolso", () => {
    const o = orcamento();
    const g = chamar("GET", `obras/${casa().id}/gastos/resumo`).corpo as ResumoGastos;
    const f = (chamar("GET", `obras/${casa().id}/resumo`).corpo as ResumoDaObra).financeiro;
    const d = chamar("GET", `obras/${casa().id}/desembolso`).corpo as import("../contrato").Desembolso;
    expect(g.total).toBe(o.totais.gasto);
    expect([f.gasto, f.pago]).toEqual([o.totais.gasto, o.totais.gasto]);
    expect(d.totais.pago).toBe(o.totais.gasto);
    expect(d.meses.reduce((t, m) => t + m.pago, 0)).toBe(o.totais.gasto);
    expect(f.etapas_estouradas).toEqual([expect.objectContaining({ descricao: "Fundação" })]);
    expect(g.a_definir).toBe(38_000);
  });

  it("dois comprovantes esperam conferência: um lido com certeza, um com dúvida", () => {
    const fila = chamar("GET", `obras/${casa().id}/comprovantes?status=a_revisar`).corpo as Comprovante[];
    expect(fila).toHaveLength(2);
    const estados = fila.map((c) => (chamar("GET", `comprovantes/${c.id}`).corpo as ComprovanteDetalhe).revisao.valor.estado).sort();
    expect(estados).toEqual(["conferir", "lido"]);
    // e cada gasto lançado tem o comprovante dele, que abre como PDF
    const gs = chamar("GET", `obras/${casa().id}/gastos`).corpo as GastoObra[];
    expect(gs).toHaveLength(13);
    const arq = arquivoComprovanteDemo(gs[0]!.comprovante_id!);
    expect(arq.tipo).toBe("application/pdf");
    expect(new TextDecoder().decode(arq.bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("o Hoje avisa o que pede você e o que pede atenção, sem nada de compra", () => {
    const h = chamar("GET", `obras/${casa().id}/hoje`).corpo as HojeNaObra;
    expect(h.pontos.map((p) => p.tipo)).toEqual(["gastos_a_conferir", "etapas_estouradas", "gastos_sem_etapa"]);
    expect(h.pontos[0]).toMatchObject({ titulo: "2 comprovantes para conferir.", acao: { tela: "gastos" } });
    expect(h.semana).toEqual([]);
  });

  it("aprovar o orçamento só põe a obra em andamento", () => {
    const vitrine = e.obras.find((o) => o.nome === "Residencial Alto Padrão")!;
    const r = chamar("POST", `obras/${vitrine.id}/orcamento/aprovar`);
    expect(r.corpo).toMatchObject({ status: "em_andamento" });
  });

  it("o Plumo responde sobre orçamento e gastos e não propõe compra", async () => {
    const falar = async (texto: string) => {
      const evs = [];
      for await (const ev of roteiroDemo({ texto, obra_id: casa().id }, admin(), 0)) evs.push(ev);
      return { texto: evs.filter((x) => x.evento === "texto").map((x) => (x.dados as { delta: string }).delta).join(""), eventos: evs.map((x) => x.evento) };
    };
    const fundacao = await falar("quanto já gastei na fundação?");
    expect(fundacao.texto).toContain("Passou do orçado");
    expect(fundacao.eventos).not.toContain("proposta");
    const compra = await falar("preciso comprar cimento");
    expect(compra.texto).toContain("não faço compras");
    expect(compra.eventos).not.toContain("proposta");
    expect(e.propostas).toHaveLength(0);
  });
});
