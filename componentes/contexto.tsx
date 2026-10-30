"use client";
/**
 * Estado compartilhado da casca: quem está logado, o aviso (toast), uma "versão" que as abas observam para recarregar
 * depois de qualquer escrita, e as propostas. A mesma proposta aparece na conversa e em Aprovações: guardá-la num
 * lugar só faz o cartão aprovado numa aba aparecer aprovado na outra.
 */
import { createContext, useCallback, useContext, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import type { Proposta, Usuario } from "@/lib/contrato";
import { api, ErroApi } from "@/lib/cliente";

export interface CartaoEstado {
  proposta: Proposta;
  registroId: string | null;
  desfeitoEm: string | null;
  /** Animação de troca a tocar uma vez (aprovou/voltou); some quando a proposta muda de novo. */
  anim: "aprovou" | "voltou" | null;
}

type AcaoPropostas =
  | { tipo: "receber"; propostas: Proposta[] }
  | { tipo: "aprovada"; proposta: Proposta; registroId: string | null }
  | { tipo: "recusada"; proposta: Proposta }
  | { tipo: "desfeita"; id: string; quando: string };

export function redutorPropostas(s: Record<string, CartaoEstado>, a: AcaoPropostas): Record<string, CartaoEstado> {
  switch (a.tipo) {
    case "receber": {
      const n = { ...s };
      // O que veio do servidor manda; o ID do registro vem da própria proposta (registro_id) ou da resposta do aprovar.
      for (const p of a.propostas)
        n[p.id] = { desfeitoEm: null, anim: null, ...s[p.id], registroId: p.registro_id ?? s[p.id]?.registroId ?? null, proposta: p };
      return n;
    }
    case "aprovada":
      return { ...s, [a.proposta.id]: { proposta: a.proposta, registroId: a.registroId, desfeitoEm: null, anim: "aprovou" } };
    case "recusada":
      return { ...s, [a.proposta.id]: { proposta: a.proposta, registroId: null, desfeitoEm: null, anim: "aprovou" } };
    case "desfeita": {
      const c = s[a.id];
      if (!c) return s;
      return { ...s, [a.id]: { ...c, proposta: { ...c.proposta, status: "desfeita" }, desfeitoEm: a.quando, anim: "voltou" } };
    }
  }
}

interface Aviso {
  id: number;
  texto: string;
  erro: boolean;
}

interface Valor {
  usuario: Usuario | null;
  podeOperar: boolean;
  demo: boolean;
  versao: number;
  mudou: () => void;
  avisar: (texto: string, erro?: boolean) => void;
  cartoes: Record<string, CartaoEstado>;
  receberPropostas: (ps: Proposta[]) => void;
  aprovar: (id: string) => Promise<void>;
  recusar: (id: string, motivo: string) => Promise<void>;
  desfazer: (id: string) => Promise<void>;
}

const Ctx = createContext<Valor | null>(null);

export function useCasca() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCasca fora do ProvedorCasca");
  return v;
}

export const mensagemDe = (e: unknown) => (e instanceof ErroApi || e instanceof Error ? e.message : "Algo deu errado. Tente de novo.");

export function ProvedorCasca({ usuario, demo, children }: { usuario: Usuario | null; demo: boolean; children: ReactNode }) {
  const [cartoes, despachar] = useReducer(redutorPropostas, {});
  const [versao, setVersao] = useState(0);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const seq = useRef(0);
  const relogio = useRef<ReturnType<typeof setTimeout>>(undefined);
  const cartoesRef = useRef(cartoes);
  cartoesRef.current = cartoes;

  const avisar = useCallback((texto: string, erro = false) => {
    clearTimeout(relogio.current);
    setAviso({ id: ++seq.current, texto, erro });
    relogio.current = setTimeout(() => setAviso(null), erro ? 6000 : 4000);
  }, []);
  const mudou = useCallback(() => setVersao((v) => v + 1), []);
  const receberPropostas = useCallback((ps: Proposta[]) => despachar({ tipo: "receber", propostas: ps }), []);

  const aprovar = useCallback(
    async (id: string) => {
      const r = await api.aprovarProposta(id);
      despachar({ tipo: "aprovada", proposta: r.proposta, registroId: r.registro.id });
      mudou();
    },
    [mudou],
  );
  const recusar = useCallback(
    async (id: string, motivo: string) => {
      const p = await api.recusarProposta(id, motivo);
      despachar({ tipo: "recusada", proposta: p });
      mudou();
    },
    [mudou],
  );
  const desfazer = useCallback(
    async (id: string) => {
      const reg = cartoesRef.current[id]?.registroId;
      if (!reg) throw new Error("Não achei o registro desta aprovação para desfazer.");
      const r = await api.desfazerRegistro(reg);
      despachar({ tipo: "desfeita", id, quando: r?.criado_em ?? new Date().toISOString() });
      mudou();
    },
    [mudou],
  );

  const valor = useMemo<Valor>(
    () => ({
      usuario,
      podeOperar: !!usuario && usuario.papel !== "viewer",
      demo,
      versao,
      mudou,
      avisar,
      cartoes,
      receberPropostas,
      aprovar,
      recusar,
      desfazer,
    }),
    [usuario, demo, versao, mudou, avisar, cartoes, receberPropostas, aprovar, recusar, desfazer],
  );

  return (
    <Ctx.Provider value={valor}>
      {children}
      <div aria-live="polite" role="status">
        {aviso && (
          <div key={aviso.id} className={`toast${aviso.erro ? " erro" : ""}`}>
            {aviso.texto}
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}
