/**
 * A revisão do comprovante sem tela: o que vem escolhido, o que ainda falta e o corpo do "Confirmar gasto".
 *
 * Cada campo chega da API num de três estados (docs/contrato.md, "Gastos da obra"):
 * - lido: a IA leu com certeza; a opção já vem marcada e pode ser trocada;
 * - conferir: dúvida; as opções vêm sem nenhuma marcada, e a pessoa escolhe (um valor errado com cara de certo é o
 *   maior risco: na dúvida, quem decide é ela);
 * - vazio: a IA não leu; o campo próprio já vem escolhido, esperando o que a pessoa digitar.
 * Em todos, a resposta própria fica ao lado das opções, com o mesmo peso.
 */
import type { CampoRevisao, CorpoConfirmar, EtapaNaArvore, Revisao } from "@/lib/contrato";
import { lerReais } from "@/lib/formato";

/** Opção da IA (índice) ou a resposta própria; null = ainda não escolheu. */
export type Escolha = number | "propria" | null;

export interface Escolhas {
  valor: Escolha;
  data: Escolha;
  favorecido: Escolha;
  descricao: Escolha;
  etapa: Escolha;
  /** O que a pessoa digitou ou escolheu na resposta própria de cada campo. */
  propria: { valor: string; data: string; favorecido: string; descricao: string; etapa: string; topico: string };
  pedido: string;
}

export function escolhaInicial(c: { escolhido: number | null; opcoes: unknown[] }): Escolha {
  if (c.escolhido !== null) return c.escolhido;
  return c.opcoes.length ? null : "propria";
}

export function escolhasIniciais(r: Revisao): Escolhas {
  return {
    valor: escolhaInicial(r.valor),
    data: escolhaInicial(r.data_pagamento),
    favorecido: escolhaInicial(r.favorecido),
    descricao: escolhaInicial(r.descricao),
    etapa: escolhaInicial(r.classificacao),
    propria: { valor: "", data: "", favorecido: "", descricao: "", etapa: "", topico: "" },
    pedido: "",
  };
}

const ROTULOS = { valor: "valor pago", data: "data do pagamento", favorecido: "quem recebeu", descricao: "o que foi pago", etapa: "etapa" } as const;
type Chave = keyof typeof ROTULOS;

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** O valor de cada campo como vai para a API, ou o motivo de ainda não ter (para a lista do que falta). */
function resolver(r: Revisao, e: Escolhas, hoje: string) {
  const texto = (c: CampoRevisao, x: Escolha, proprio: string) =>
    x === null ? null : x === "propria" ? proprio.trim() || null : String(c.opcoes[x]?.valor ?? "") || null;
  const valor = e.valor === null ? null : e.valor === "propria" ? lerReais(e.propria.valor) : Number(r.valor.opcoes[e.valor]?.valor);
  const data = texto(r.data_pagamento, e.data, e.propria.data);
  const favorecidoOpcao = typeof e.favorecido === "number" ? r.favorecido.opcoes[e.favorecido] : undefined;
  const etapaOpcao = typeof e.etapa === "number" ? r.classificacao.opcoes[e.etapa] : undefined;
  return {
    valor: valor && valor > 0 ? valor : null,
    data: data && DATA.test(data) && data <= hoje ? data : null,
    dataNoFuturo: !!data && DATA.test(data) && data > hoje,
    favorecido: texto(r.favorecido, e.favorecido, e.propria.favorecido),
    fornecedor_id: favorecidoOpcao?.fornecedor_id ?? null,
    descricao: texto(r.descricao, e.descricao, e.propria.descricao),
    etapa: etapaOpcao?.etapa ?? (e.etapa === "propria" ? e.propria.etapa || null : null),
    topico_id: etapaOpcao ? etapaOpcao.topico_id : e.etapa === "propria" ? e.propria.topico || null : null,
  };
}

/** O que ainda falta para confirmar, em palavras ("data do pagamento", "etapa"). Vazia = pode confirmar. */
export function pendencias(r: Revisao, e: Escolhas, hoje: string): string[] {
  const v = resolver(r, e, hoje);
  const falta: Chave[] = [];
  if (v.valor === null) falta.push("valor");
  if (v.data === null) falta.push("data");
  if (!v.favorecido) falta.push("favorecido");
  if (!v.descricao) falta.push("descricao");
  if (!v.etapa) falta.push("etapa");
  return falta.map((k) => (k === "data" && v.dataNoFuturo ? "data do pagamento (não pode ser depois de hoje)" : ROTULOS[k]));
}

export function corpoConfirmar(r: Revisao, e: Escolhas, hoje: string): CorpoConfirmar | null {
  if (pendencias(r, e, hoje).length) return null;
  const v = resolver(r, e, hoje);
  return {
    valor: v.valor!,
    data_pagamento: v.data!,
    favorecido: v.favorecido!,
    descricao: v.descricao!,
    etapa: v.etapa!,
    topico_id: v.topico_id,
    fornecedor_id: v.fornecedor_id,
    pedido_id: e.pedido || null,
  };
}

/** "2026-11-03" → "03/11/2026", sem passar por Date (o fuso do navegador não mexe no dia). */
export const fmtDia = (iso: string) => (DATA.test(iso) ? iso.split("-").reverse().join("/") : iso);

/** Hoje no fuso da obra (São Paulo), em AAAA-MM-DD: é o limite da data do pagamento. */
export function hojeNaObra(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

/** Nome legível de uma etapa e tópico, pela árvore da obra (arquivados não estão nela: cai para a chave). */
export function rotuloEtapa(arvore: EtapaNaArvore[], etapa: string, topicoId: string | null, extra?: Map<string, string>): string {
  const no = arvore.find((x) => x.chave === etapa);
  const nome = no?.nome ?? extra?.get(etapa) ?? etapa;
  if (!topicoId) return nome;
  const t = no?.topicos.find((x) => x.id === topicoId)?.nome ?? extra?.get(topicoId);
  return t ? `${nome} › ${t}` : nome;
}
