/**
 * Sessões de conversa. A lista vem de GET /sessoes (o agente grava o histórico na API); as mensagens de uma sessão
 * só são buscadas quando ela é aberta. Sessão nova nasce aqui com um UUIDv7 que vai como `sessao_id` no 1º turno,
 * assim a mesma conversa tem um ID só na lateral, no agente e na API.
 */
import type { EventoConversa } from "@/lib/contrato";
import type { Msg, MsgAgente, MsgEu, SessaoApi } from "@/lib/historico";
import { uuid7 } from "@/lib/ids";

export type Tela = "almoxarifado" | "pedidos" | "aprovacoes";
export type AbaAtiva = "conversa" | Tela;

export type { Msg, MsgAgente, MsgEu } from "@/lib/historico";

export interface Sessao {
  id: string;
  servidorId: string | null;
  obraId: string;
  /** false = veio da lista do servidor e as mensagens ainda não foram buscadas. */
  carregada: boolean;
  erroCarga: string | null;
  titulo: string;
  mensagens: Msg[];
  abas: Tela[];
  ativa: AbaAtiva;
}

export type AcaoSessoes =
  | { tipo: "nova"; sessao: Sessao }
  | { tipo: "listadas"; sessoes: SessaoApi[]; obraPadrao: string }
  | { tipo: "carregou"; sessaoId: string; mensagens: Msg[] }
  | { tipo: "falhouCarga"; sessaoId: string; erro: string | null } // null = tentar de novo
  | { tipo: "perguntou"; sessaoId: string; eu: MsgEu; agente: MsgAgente }
  | { tipo: "evento"; sessaoId: string; msgId: string; evento: EventoConversa }
  | { tipo: "parou"; sessaoId: string; msgId: string; erro?: string }
  | { tipo: "abrirTela"; sessaoId: string; tela: Tela }
  | { tipo: "fecharTela"; sessaoId: string; tela: Tela }
  | { tipo: "ativar"; sessaoId: string; aba: AbaAtiva };

let n = 0;
export const idLocal = (p: string) => `${p}-${Date.now().toString(36)}-${(++n).toString(36)}`;

export function novaSessao(obraId: string): Sessao {
  return { id: idLocal("s"), servidorId: uuid7(), obraId, titulo: "Nova conversa", carregada: true, erroCarga: null, mensagens: [], abas: [], ativa: "conversa" };
}

export function novaPergunta(texto: string): { eu: MsgEu; agente: MsgAgente } {
  return {
    eu: { id: idLocal("m"), papel: "eu", texto },
    agente: { id: idLocal("m"), papel: "agente", ferramentas: [], texto: "", propostas: [], erro: null, terminou: false },
  };
}

const tituloDe = (t: string) => {
  const u = t.replace(/\s+/g, " ").trim();
  return u.length > 42 ? `${u.slice(0, 40).trimEnd()}…` : u;
};

function naMsg(s: Sessao, msgId: string, f: (m: MsgAgente) => MsgAgente): Sessao {
  return { ...s, mensagens: s.mensagens.map((m) => (m.id === msgId && m.papel === "agente" ? f(m) : m)) };
}

function aplicar(s: Sessao, a: AcaoSessoes): Sessao {
  switch (a.tipo) {
    case "perguntou":
      return {
        ...s,
        titulo: s.mensagens.length ? s.titulo : tituloDe(a.eu.texto),
        mensagens: [...s.mensagens, a.eu, a.agente],
      };
    case "evento": {
      const e = a.evento;
      if (e.tipo === "fim") return naMsg({ ...s, servidorId: e.sessao_id || s.servidorId }, a.msgId, (m) => ({ ...m, terminou: true }));
      return naMsg(s, a.msgId, (m) => {
        if (e.tipo === "texto") return { ...m, texto: m.texto + e.delta };
        if (e.tipo === "ferramenta") return { ...m, ferramentas: [...m.ferramentas, { nome: e.nome, nivel: e.nivel, resumo: e.resumo }] };
        if (e.tipo === "proposta") return m.propostas.includes(e.proposta.id) ? m : { ...m, propostas: [...m.propostas, e.proposta.id] };
        return { ...m, erro: e.mensagem, terminou: true };
      });
    }
    case "parou":
      return naMsg(s, a.msgId, (m) => (m.terminou ? m : { ...m, terminou: true, erro: a.erro ?? m.erro }));
    case "abrirTela":
      return { ...s, abas: s.abas.includes(a.tela) ? s.abas : [...s.abas, a.tela], ativa: a.tela };
    case "fecharTela": {
      const abas = s.abas.filter((t) => t !== a.tela);
      if (s.ativa !== a.tela) return { ...s, abas };
      const i = s.abas.indexOf(a.tela);
      return { ...s, abas, ativa: abas[i - 1] ?? abas[i] ?? "conversa" };
    }
    case "ativar":
      return { ...s, ativa: a.aba };
    case "carregou":
      return { ...s, carregada: true, erroCarga: null, mensagens: a.mensagens };
    case "falhouCarga":
      return { ...s, erroCarga: a.erro };
    default:
      return s;
  }
}

export function redutorSessoes(ss: Sessao[], a: AcaoSessoes): Sessao[] {
  // A sessão nova vai para o topo: a lista do servidor também vem das mais recentes para as mais antigas.
  if (a.tipo === "nova") return [a.sessao, ...ss];
  if (a.tipo === "listadas") {
    const conhecidas = new Set(ss.map((s) => s.servidorId));
    const novas = a.sessoes
      .filter((x) => !conhecidas.has(x.id))
      .map<Sessao>((x) => ({
        id: x.id,
        servidorId: x.id,
        obraId: x.obra_id ?? a.obraPadrao,
        titulo: x.titulo || "Conversa",
        carregada: x.total_mensagens === 0,
        erroCarga: null,
        mensagens: [],
        abas: [],
        ativa: "conversa",
      }));
    return [...ss, ...novas];
  }
  return ss.map((s) => (s.id === a.sessaoId ? aplicar(s, a) : s));
}
