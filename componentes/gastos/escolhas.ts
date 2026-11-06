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
import { fmtReais, lerReais } from "@/lib/formato";

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
  const nome = no ? nomeComCodigo(no) : (extra?.get(etapa) ?? etapa);
  if (!topicoId) return nome;
  const t = no?.topicos.find((x) => x.id === topicoId)?.nome ?? extra?.get(topicoId);
  return t ? `${nome} › ${t}` : nome;
}

/**
 * O que a IA leu, em uma linha da fila: valor, quem recebeu e a data do pagamento (a 1ª opção de cada campo). A
 * leitura crua vem como `unknown` no contrato (é o esquema do modelo); daqui só se tira o que tem o formato esperado,
 * e o resto fica de fora em vez de quebrar a fila.
 */
export interface LidoNaFila {
  valor: string | null;
  favorecido: string | null;
  data: string | null;
  descricao: string | null;
  duvida: boolean;
}

function primeira(campo: unknown): { valor: string; duvida: boolean } | null {
  if (!campo || typeof campo !== "object") return null;
  const c = campo as { certeza?: unknown; opcoes?: unknown };
  const op = Array.isArray(c.opcoes) ? (c.opcoes[0] as { valor?: unknown } | undefined) : undefined;
  if (!op || typeof op.valor !== "string" || !op.valor.trim()) return null;
  return { valor: op.valor.trim(), duvida: c.certeza !== "alta" || (c.opcoes as unknown[]).length > 1 };
}

export function lidoNaFila(leitura: unknown): LidoNaFila | null {
  if (!leitura || typeof leitura !== "object") return null;
  const l = leitura as Record<string, unknown>;
  const valor = primeira(l.valor);
  const favorecido = primeira(l.favorecido);
  const data = primeira(l.data_pagamento);
  const descricao = primeira(l.descricao);
  if (!valor && !favorecido && !data && !descricao) return null;
  const centavos = valor ? lerReais(valor.valor) : null;
  return {
    valor: valor ? (centavos !== null ? fmtReais(centavos) : valor.valor) : null,
    favorecido: favorecido?.valor ?? null,
    data: data ? fmtDia(data.valor) : null,
    descricao: descricao?.valor ?? null,
    duvida: !!(valor?.duvida || favorecido?.duvida || data?.duvida),
  };
}

/**
 * De onde vêm as etapas da árvore ("opção 2"): `orcamento` quando a obra tem orçamento (as etapas são as dele, com
 * código e descrição); `padrao` quando não tem. Sem o campo (a API de hoje), vale `padrao`. O cliente já desce a
 * `origem` do topo da resposta para cada etapa (`normalizarArvore`).
 */
export type OrigemArvore = "orcamento" | "padrao";

export const origemDaArvore = (arvore: EtapaNaArvore[]): OrigemArvore => (arvore.some((e) => e.origem === "orcamento") ? "orcamento" : "padrao");

/** Gasto cuja etapa não está mais na árvore do orçamento (a obra ganhou orçamento depois do lançamento). Extra arquivada não conta. */
export const foraDoOrcamento = (arvore: EtapaNaArvore[], etapa: string) =>
  origemDaArvore(arvore) === "orcamento" && !etapa.startsWith("x-") && !arvore.some((e) => e.chave === etapa);

/**
 * Código e nome de uma etapa do orçamento: o código é a chave ("3", "18.2") e o nome, a descrição da planilha. Etapa
 * padrão (chave como "eletrica") fica só com o nome.
 */
export function codigoDaEtapa(e: Pick<EtapaNaArvore, "chave" | "codigo" | "origem">): string | null {
  if (e.codigo) return e.codigo;
  // a etapa extra ("x-<id>") convive com as do orçamento, mas não tem código: a chave dela é só um id
  return e.origem === "orcamento" && !e.chave.startsWith("x-") ? e.chave : null;
}

/** "18 · INSTALAÇÃO ELÉTRICA - 220V" na etapa do orçamento; o nome sozinho na padrão. */
/**
 * O nome sem o código na frente: a descrição da planilha às vezes já começa pelo número ("3 FUNDAÇÕES"), e a árvore,
 * que mostra o código à parte, o repetiria ("3 3 FUNDAÇÕES").
 */
export function nomeSemCodigo(e: Pick<EtapaNaArvore, "chave" | "codigo" | "origem" | "nome">): string {
  const c = codigoDaEtapa(e);
  if (!c || !e.nome.startsWith(c)) return e.nome;
  const resto = e.nome.slice(c.length);
  // só tira se o código for uma palavra inteira: "1 SERVIÇOS" sim, "10 X" com código "1" não
  return /^[\s.·–-]/.test(resto) ? resto.replace(/^[\s.·–-]+/, "") || e.nome : e.nome;
}

export function nomeComCodigo(e: Pick<EtapaNaArvore, "chave" | "codigo" | "origem" | "nome">): string {
  const c = codigoDaEtapa(e);
  return c && !e.nome.startsWith(c) ? `${c} · ${e.nome}` : e.nome;
}

/**
 * A etapa em poucas letras, para o aviso do celular (2 linhas): "22 · SPDA" para "22 SISTEMA DE PROTEÇÃO CONTRA
 * DESCARGAS ATMOSFÉRICAS (SPDA)". Sigla entre parênteses no fim, quando há; senão a descrição sem o código repetido.
 */
export function nomeCurto(e: Pick<EtapaNaArvore, "chave" | "codigo" | "origem" | "nome">): string {
  const c = codigoDaEtapa(e);
  const nome = nomeSemCodigo(e);
  const sigla = /\(([^()]{2,12})\)\s*$/.exec(nome)?.[1]?.trim();
  const curto = sigla || nome;
  return c && !curto.startsWith(c) ? `${c} · ${curto}` : curto;
}

/** Arquivados que o resumo ainda conhece (a árvore não traz arquivados): só os que têm gasto aparecem aqui. */
export interface Arquivado {
  tipo: "etapa" | "topico";
  /** id para o PATCH (etapa extra sem o "x-"; tópico, o próprio id). */
  id: string;
  nome: string;
  etapaNome: string;
}

export function arquivadosDoResumo(
  arvore: EtapaNaArvore[],
  resumo: { etapas: { etapa: string; nome: string; topicos: { topico_id: string | null; nome: string }[] }[] } | null,
): Arquivado[] {
  const fora: Arquivado[] = [];
  for (const e of resumo?.etapas ?? []) {
    const no = arvore.find((x) => x.chave === e.etapa);
    // etapa fixa ou do orçamento não se arquiva: só a extra ("x-<id>") some da árvore por arquivamento
    if (!no && e.etapa.startsWith("x-")) fora.push({ tipo: "etapa", id: e.etapa.slice(2), nome: e.nome, etapaNome: e.nome });
    // tópico de etapa que nem está na árvore volta junto com ela; só o tópico arquivado de etapa ativa entra aqui
    if (no)
      for (const t of e.topicos)
        if (t.topico_id && !no.topicos.some((x) => x.id === t.topico_id)) fora.push({ tipo: "topico", id: t.topico_id, nome: t.nome, etapaNome: e.nome });
  }
  return fora;
}
