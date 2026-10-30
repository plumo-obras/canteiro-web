/**
 * Histórico gravado pelo agente (GET /sessoes/{id}/mensagens, no formato de mensagens da Anthropic) → as mensagens
 * que a tela mostra. Função pura: a mesma conversa tem de aparecer igual ao vivo (SSE) e ao reabrir.
 *
 * - `user` com texto vira a bolha; o bloco "(Obra em foco na tela: …)" é contexto para o modelo, não fala da pessoa.
 * - `user` só com tool_result não aparece: é o retorno das ferramentas.
 * - `assistant`: só os blocos de texto; cada tool_use vira o chip "usou …".
 * - A volta inteira do agente (várias mensagens assistant intercaladas com tool_result) é um balão só, como ao vivo.
 * - O tool_result de um propor_* traz o proposta_id: a proposta volta como cartão (o estado vem de GET /propostas).
 */
import type { DataISO, NivelFerramenta } from "./contrato";

export interface MsgEu {
  id: string;
  papel: "eu";
  texto: string;
}
export interface MsgAgente {
  id: string;
  papel: "agente";
  ferramentas: { nome: string; nivel: NivelFerramenta; resumo: string }[];
  texto: string;
  propostas: string[];
  erro: string | null;
  terminou: boolean;
}
export type Msg = MsgEu | MsgAgente;

export type Bloco =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input?: unknown }
  | { type: "tool_result"; tool_use_id: string; content?: string | Bloco[]; is_error?: boolean }
  | { type: string; [k: string]: unknown };

export interface MensagemSessao {
  id: string;
  sessao_id: string;
  seq: number;
  papel: "user" | "assistant";
  conteudo: string | Bloco[];
  criado_em: DataISO;
}

export interface SessaoApi {
  id: string;
  tenant_id: string;
  dono: string;
  obra_id: string | null;
  titulo: string;
  abas: unknown[];
  total_mensagens: number;
  criado_em: DataISO;
  atualizado_em: DataISO;
}

const RESUMO: Record<string, string> = {
  listar_obras: "consultou as obras",
  consultar_estoque: "usou almoxarifado",
  historico_movimentos: "usou movimentos do almoxarifado",
  listar_pedidos: "usou pedidos",
  propor_pedido: "preparou uma proposta de pedido",
  propor_avanco_pedido: "preparou uma proposta de avanço de pedido",
  propor_ajuste_estoque: "preparou uma proposta de ajuste de estoque",
};

export const chipDaFerramenta = (nome: string) => ({
  nome,
  nivel: (nome.startsWith("propor_") ? "propoe" : "consulta") as NivelFerramenta,
  resumo: RESUMO[nome] ?? `usou ${nome.replace(/_/g, " ")}`,
});

const CONTEXTO_OBRA = /^\(Obra em foco na tela: [^)]*\)$/;

const blocos = (c: string | Bloco[] | undefined): Bloco[] => (typeof c === "string" ? [{ type: "text", text: c }] : (c ?? []));

/** proposta_id dentro do resultado de um propor_* (texto JSON, solto ou em blocos de texto). */
function propostaDoResultado(r: Extract<Bloco, { type: "tool_result" }>): string | null {
  if (r.is_error) return null;
  for (const b of blocos(r.content)) {
    if (b.type !== "text" || typeof b.text !== "string") continue;
    try {
      const j = JSON.parse(b.text) as { proposta_id?: unknown };
      if (typeof j?.proposta_id === "string") return j.proposta_id;
    } catch {
      /* resultado que não é JSON (erro de ferramenta em texto) */
    }
  }
  return null;
}

export function formatarHistorico(ms: MensagemSessao[]): { mensagens: Msg[]; propostaIds: string[] } {
  const saida: Msg[] = [];
  const propostaIds: string[] = [];
  const ferramentaDe = new Map<string, string>(); // tool_use_id → nome
  let agente: MsgAgente | null = null;
  const textos: string[] = [];

  const fecharAgente = () => {
    if (agente) {
      agente.texto = textos.join("\n\n");
      if (agente.texto || agente.ferramentas.length || agente.propostas.length) saida.push(agente);
    }
    agente = null;
    textos.length = 0;
  };

  for (const m of [...ms].sort((a, b) => a.seq - b.seq)) {
    const bs = blocos(m.conteudo);
    if (m.papel === "assistant") {
      agente ??= { id: m.id, papel: "agente", ferramentas: [], texto: "", propostas: [], erro: null, terminou: true };
      for (const b of bs) {
        if (b.type === "text" && typeof b.text === "string" && b.text.trim()) textos.push(b.text.trim());
        else if (b.type === "tool_use" && typeof b.name === "string") {
          ferramentaDe.set(String(b.id), b.name);
          agente.ferramentas.push(chipDaFerramenta(b.name));
        }
      }
      continue;
    }
    // user: resultados de ferramenta pertencem à volta do agente em andamento
    for (const b of bs) {
      if (b.type !== "tool_result") continue;
      const r = b as Extract<Bloco, { type: "tool_result" }>;
      if (!ferramentaDe.get(r.tool_use_id)?.startsWith("propor_")) continue;
      const id = propostaDoResultado(r);
      if (id && agente && !agente.propostas.includes(id)) {
        agente.propostas.push(id);
        propostaIds.push(id);
      }
    }
    const fala = bs
      .filter((b): b is { type: "text"; text: string } => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text.trim())
      .filter((t) => t && !CONTEXTO_OBRA.test(t))
      .join("\n\n");
    if (fala) {
      fecharAgente();
      saida.push({ id: m.id, papel: "eu", texto: fala });
    }
  }
  fecharAgente();
  return { mensagens: saida, propostaIds };
}
