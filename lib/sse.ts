/**
 * Leitor de Server-Sent Events sobre fetch. O POST /conversa leva corpo e Authorization, coisas que o EventSource do
 * navegador não envia; por isso a leitura é feita à mão, seguindo o formato do WHATWG (event/data, linha em branco
 * despacha, ":" é comentário, CRLF/CR/LF valem como quebra).
 */
import type { EventoConversa, NivelFerramenta, Proposta } from "./contrato";

export interface EventoSSE {
  evento: string;
  dados: string;
}

export function criarLeitorSSE() {
  let resto = "";
  let evento = "";
  let dados: string[] = [];

  function linha(l: string, saida: EventoSSE[]) {
    if (l === "") {
      if (dados.length) saida.push({ evento: evento || "message", dados: dados.join("\n") });
      evento = "";
      dados = [];
      return;
    }
    if (l.startsWith(":")) return;
    const i = l.indexOf(":");
    const campo = i < 0 ? l : l.slice(0, i);
    let valor = i < 0 ? "" : l.slice(i + 1);
    if (valor.startsWith(" ")) valor = valor.slice(1);
    if (campo === "event") evento = valor;
    else if (campo === "data") dados.push(valor);
  }

  return {
    empurrar(pedaco: string): EventoSSE[] {
      const saida: EventoSSE[] = [];
      resto += pedaco;
      // Um "\r" no fim do pedaço pode ser metade de um "\r\n": espera o próximo pedaço para decidir.
      const partes = resto.split(/\r\n|\r(?!$)|\n/);
      resto = partes.pop() ?? "";
      for (const l of partes) linha(l, saida);
      return saida;
    },
    /** Fim do fluxo: um evento sem a linha em branco final ainda conta (servidor que fechou sem "\n\n"). */
    fim(): EventoSSE[] {
      const saida: EventoSSE[] = [];
      if (resto) linha(resto.replace(/\r$/, ""), saida);
      resto = "";
      linha("", saida);
      return saida;
    },
  };
}

export async function* lerSSE(corpo: ReadableStream<Uint8Array>): AsyncGenerator<EventoSSE> {
  const leitor = corpo.getReader();
  const dec = new TextDecoder();
  const sse = criarLeitorSSE();
  try {
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      yield* sse.empurrar(dec.decode(value, { stream: true }));
    }
    yield* sse.empurrar(dec.decode());
    yield* sse.fim();
  } finally {
    leitor.releaseLock();
  }
}

const NIVEIS: NivelFerramenta[] = ["consulta", "propoe"];

/** Traduz o evento bruto para o tipo do contrato. Evento desconhecido é ignorado (o agente pode ganhar eventos novos). */
export function interpretarEvento(e: EventoSSE): EventoConversa | null {
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(e.dados) as Record<string, unknown>;
  } catch {
    return e.evento === "erro" ? { tipo: "erro", mensagem: e.dados } : null;
  }
  switch (e.evento) {
    case "texto":
      return { tipo: "texto", delta: String(d.delta ?? "") };
    case "ferramenta":
      return {
        tipo: "ferramenta",
        nome: String(d.nome ?? ""),
        nivel: NIVEIS.includes(d.nivel as NivelFerramenta) ? (d.nivel as NivelFerramenta) : "consulta",
        resumo: String(d.resumo ?? ""),
      };
    case "proposta": {
      // O contrato manda a Proposta direto; {proposta: …} é só tolerância.
      const p = (d.proposta ?? d) as Proposta;
      return p && typeof p.id === "string" ? { tipo: "proposta", proposta: p } : null;
    }
    case "fim": {
      const uso = (d.uso ?? {}) as { tokens?: number; custo?: number };
      return { tipo: "fim", sessao_id: String(d.sessao_id ?? ""), uso: { tokens: uso.tokens ?? 0, custo: uso.custo ?? 0 } };
    }
    case "erro":
      return { tipo: "erro", mensagem: String(d.mensagem ?? "Algo deu errado na conversa.") };
    default:
      return null;
  }
}
