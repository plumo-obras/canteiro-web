/**
 * Agente de mentira do modo de demonstração: responde por roteiro, sem modelo de IA, emitindo os mesmos eventos SSE do
 * contrato (ferramenta → texto → fim). Como o agente de verdade, não faz conta: cita o orçamento, os gastos e o
 * cronograma que a "API" (a loja de demonstração) responde.
 */
import "server-only";
import type { Obra, Usuario } from "../contrato";
import { fmtPct } from "../cronograma";
import { fmtReais } from "../formato";
import { estado, gravarNaSessao, retratoDemo, uuid7 } from "./loja";

export interface EventoBruto {
  evento: "texto" | "ferramenta" | "proposta" | "fim" | "erro";
  dados: unknown;
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function* roteiroDemo(
  corpo: { texto?: string; sessao_id?: string | null; obra_id?: string | null },
  u: Usuario,
  pausa = 28,
): AsyncGenerator<EventoBruto> {
  const e = estado();
  const texto = String(corpo.texto ?? "").trim();
  const sessao_id = corpo.sessao_id || uuid7();
  const obra = e.obras.find((o) => o.id === corpo.obra_id) ?? e.obras[0]!;

  if (/^\/sem-?cr[eé]ditos/i.test(texto)) {
    yield { evento: "erro", dados: { mensagem: "Sem créditos de IA neste mês. Fale com quem administra a conta para liberar mais." } };
    return;
  }

  await espera(pausa * 6);
  const r = resposta(obra, texto);
  yield { evento: "ferramenta", dados: { nome: r.ferramenta, nivel: "consulta", resumo: `${r.resumo} · ${obra.nome}` } };
  await espera(pausa * 8);
  yield* emPedacos(r.texto, pausa);
  gravarVolta(sessao_id, u, obra, texto, r.ferramenta, r.texto);
  yield { evento: "fim", dados: { sessao_id, uso: { tokens: 0, custo: 0 } } };
}

/** Em pedaços de poucas palavras, como o modelo faz, para a tela exercitar o streaming de verdade. */
async function* emPedacos(resposta: string, pausa: number): AsyncGenerator<EventoBruto> {
  const pedacos = resposta.match(/\S+\s*|\s+/g) ?? [];
  for (let i = 0; i < pedacos.length; i += 3) {
    yield { evento: "texto", dados: { delta: pedacos.slice(i, i + 3).join("") } };
    await espera(pausa);
  }
}

/** Grava a volta no mesmo formato do agente de verdade, para a lateral reabrir a conversa depois. */
function gravarVolta(sessao_id: string, u: Usuario, obra: Obra, texto: string, ferramenta: string, resposta: string) {
  const uso1 = uuid7();
  gravarNaSessao(sessao_id, u, obra.id, texto, [
    { papel: "user", conteudo: [{ type: "text", text: `(Obra em foco na tela: obra_id=${obra.id})` }, { type: "text", text: texto }] },
    { papel: "assistant", conteudo: [{ type: "tool_use", id: uso1, name: ferramenta, input: { obra_id: obra.id } }] },
    { papel: "user", conteudo: [{ type: "tool_result", tool_use_id: uso1, content: "[…dados da obra…]" }] },
    { papel: "assistant", conteudo: [{ type: "text", text: resposta }] },
  ]);
}

const semAcento = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const pctDe = (parte: number, todo: number) => (todo ? fmtPct(Math.round((parte * 10000) / todo)) : "—");

/**
 * O roteiro: orçamento, gastos e cronograma, citando o que as rotas da demo respondem. O Plumo não compra nem controla
 * estoque; pergunta de compra recebe o que ele faz no lugar.
 */
function resposta(obra: Obra, texto: string): { ferramenta: string; resumo: string; texto: string } {
  const r = retratoDemo(obra.id);
  const t = semAcento(texto);
  const etapas = r.orcamento.etapas;
  const total = r.orcamento.totais;

  if (/compr|pedido|cota[cç]|estoque|fornecedor|almoxarif/.test(t))
    return {
      ferramenta: "resumo_obra",
      resumo: "consultou o resumo da obra",
      texto: "Eu não faço compras nem controlo estoque.\n\nAqui eu acompanho o **orçamento**, o **cronograma** e os **gastos**. Mandou pagar alguma coisa? Envie a foto do comprovante em Gastos que eu leio e já sugiro a etapa.",
    };

  const etapa = etapas.find((x) => semAcento(x.descricao).split(/\s+/).some((p) => p.length >= 5 && t.includes(p)));
  if (etapa) {
    const linha = `Orçado ${fmtReais(etapa.atual)} · gasto ${fmtReais(etapa.gasto)} (${pctDe(etapa.gasto, etapa.atual)})`;
    const fim = etapa.estourou
      ? `**Passou do orçado em ${fmtReais(-etapa.saldo)}.** Vale olhar os gastos dela em Gastos, por etapa.`
      : etapa.gasto
        ? `Faltam **${fmtReais(etapa.saldo)}** para chegar ao orçado.`
        : "Ainda não tem gasto lançado.";
    return { ferramenta: "consultar_orcamento", resumo: "consultou o orçamento", texto: `Em ${etapa.etapa} ${etapa.descricao}:\n\n${linha}\n\n${fim}` };
  }

  if (/estour|passou|acima|orcad|orcamento/.test(t)) {
    const est = etapas.filter((x) => x.estourou);
    return {
      ferramenta: "consultar_orcamento",
      resumo: "consultou o orçamento",
      texto: est.length
        ? `${est.length === 1 ? "Uma etapa passou" : `${est.length} etapas passaram`} do orçado:\n\n${est.map((x) => `${x.etapa} ${x.descricao}: **${fmtReais(-x.saldo)}** acima (gasto ${fmtReais(x.gasto)} de ${fmtReais(x.atual)})`).join("\n\n")}\n\nNo total, a obra gastou ${fmtReais(total.gasto)} de ${fmtReais(total.atual)} orçados (${pctDe(total.gasto, total.atual)}).`
        : `Nenhuma etapa passou do orçado. A obra gastou ${fmtReais(total.gasto)} de ${fmtReais(total.atual)} (${pctDe(total.gasto, total.atual)}).`,
    };
  }

  if (/atras|prazo|cronograma|termina|chuva|semana|mes/.test(t)) {
    const c = r.cronograma;
    if (!c.inicio) return { ferramenta: "consultar_cronograma", resumo: "consultou o cronograma", texto: "Esta obra ainda não tem cronograma. Monte em Cronograma (o Gerar com IA sugere um a partir do orçamento)." };
    const mesAtual = new Date().toISOString().slice(0, 7);
    const [ai, mi] = c.inicio.split("-").map(Number) as [number, number];
    const [ah, mh] = mesAtual.split("-").map(Number) as [number, number];
    const j = (ah - ai) * 12 + (mh - mi);
    const agora = c.etapas.filter((x) => (x.percentuais[j] ?? 0) > 0).map((x) => x.descricao);
    const termino = c.prazo.termino_contratual;
    return {
      ferramenta: "consultar_cronograma",
      resumo: "consultou o cronograma",
      texto: `${termino ? `Pelo cronograma, a obra termina em **${termino.slice(5, 7)}/${termino.slice(0, 4)}**.` : "O cronograma não tem término definido."}${agora.length ? `\n\nNeste mês estão previstas: ${agora.join(", ")}.` : ""}\n\nAinda não há medição lançada, então não dá para afirmar o que está atrasado no físico. O que dá para ver é o dinheiro: a obra gastou ${fmtReais(total.gasto)} (${pctDe(total.gasto, total.atual)} do orçado).`,
    };
  }

  const est = etapas.filter((x) => x.estourou);
  const avisos = [
    est.length ? `${est.map((x) => x.descricao).join(", ")} passou do orçado em **${fmtReais(est.reduce((s, x) => s - x.saldo, 0))}**.` : "",
    r.aConferir ? `${r.aConferir === 1 ? "Um comprovante espera" : `${r.aConferir} comprovantes esperam`} você conferir em Gastos.` : "",
    r.gastos.a_definir ? `${fmtReais(r.gastos.a_definir)} em gasto sem etapa, para definir.` : "",
  ].filter(Boolean);
  return {
    ferramenta: "consultar_orcamento",
    resumo: "consultou o orçamento e os gastos",
    texto: `Na ${obra.nome}, o gasto até hoje é **${fmtReais(total.gasto)}** de ${fmtReais(total.atual)} orçados (${pctDe(total.gasto, total.atual)}).${avisos.length ? `\n\n${avisos.join("\n\n")}` : ""}\n\nPergunte por uma etapa (ex.: "quanto já gastei na estrutura?") e eu mostro o orçado e o gasto dela.`,
  };
}

export function emSSE(ev: EventoBruto) {
  return `event: ${ev.evento}\ndata: ${JSON.stringify(ev.dados)}\n\n`;
}
