"use client";
/**
 * Estado compartilhado da casca: quem está logado, o aviso (toast), uma "versão" que as abas observam para recarregar
 * depois de qualquer escrita, e as propostas. A mesma proposta aparece na conversa e em Aprovações: guardá-la num
 * lugar só faz o cartão aprovado numa aba aparecer aprovado na outra.
 */
import { createContext, useCallback, useContext, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import type { AjustesProposta, Proposta, Usuario } from "@/lib/contrato";
import { api, ErroApi } from "@/lib/cliente";
import type { AbaAtiva } from "./sessoes";

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

/** Botão dentro do aviso: hoje só o "Desfazer" do que a pessoa acabou de fazer na tela. */
export interface AcaoAviso {
  rotulo: string;
  fazer: () => Promise<void>;
}

interface Aviso {
  id: number;
  texto: string;
  erro: boolean;
  acao?: AcaoAviso;
}

interface Valor {
  usuario: Usuario | null;
  podeOperar: boolean;
  demo: boolean;
  versao: number;
  mudou: () => void;
  avisar: (texto: string, erro?: boolean, acao?: AcaoAviso) => void;
  /** Aviso de sucesso com "Desfazer" quando a escrita devolveu o registro. */
  avisarFeito: (texto: string, registroId: string | null | undefined) => void;
  cartoes: Record<string, CartaoEstado>;
  receberPropostas: (ps: Proposta[]) => void;
  aprovar: (id: string, ajustes?: AjustesProposta) => Promise<void>;
  recusar: (id: string, motivo: string) => Promise<void>;
  desfazer: (id: string) => Promise<void>;
  /** Troca a tela da obra sem recarregar (a faixa de próximo passo, por exemplo). */
  irParaTela: (tela: AbaAtiva) => void;
  /** Só a casca chama: a tela aberta é estado dela, e devolve a função que desfaz o registro. */
  registrarNavegacao: (ir: (tela: AbaAtiva) => void) => () => void;
}

const Ctx = createContext<Valor | null>(null);

export function useCasca() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCasca fora do ProvedorCasca");
  return v;
}

export const mensagemDe = (e: unknown) => (e instanceof ErroApi || e instanceof Error ? e.message : "Algo deu errado. Tente de novo.");

/** Quanto o aviso com Desfazer fica na tela sem ninguém mexer nele, e quanto ainda fica depois que o ponteiro sai. */
export const DURA_COM_ACAO = 12000;
const DEPOIS_DE_SOLTAR = 4000;

export function ProvedorCasca({ usuario, demo, children }: { usuario: Usuario | null; demo: boolean; children: ReactNode }) {
  const [cartoes, despachar] = useReducer(redutorPropostas, {});
  const [versao, setVersao] = useState(0);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const seq = useRef(0);
  const relogio = useRef<ReturnType<typeof setTimeout>>(undefined);
  const cartoesRef = useRef(cartoes);
  cartoesRef.current = cartoes;

  const avisar = useCallback((texto: string, erro = false, acao?: AcaoAviso) => {
    clearTimeout(relogio.current);
    setAviso({ id: ++seq.current, texto, erro, acao });
    // Com botão, o aviso fica mais tempo: 4 s não dá para ler, entender que errou e alcançar o Desfazer.
    relogio.current = setTimeout(() => setAviso(null), erro ? 6000 : acao ? DURA_COM_ACAO : 4000);
  }, []);
  // Com o ponteiro ou o foco no aviso, ele não some: o Desfazer do "Gasto lançado" sumia no meio do caminho até ele
  // (9 s corridos, sem pausa), e o clique caía no vazio. Saiu de cima, ele ainda fica uns segundos.
  const segurarAviso = useCallback(() => clearTimeout(relogio.current), []);
  const soltarAviso = useCallback(() => {
    clearTimeout(relogio.current);
    relogio.current = setTimeout(() => setAviso(null), DEPOIS_DE_SOLTAR);
  }, []);
  const mudou = useCallback(() => setVersao((v) => v + 1), []);
  const avisarFeito = useCallback(
    (texto: string, registroId: string | null | undefined) => {
      if (!registroId) return avisar(texto);
      avisar(texto, false, {
        rotulo: "Desfazer",
        fazer: async () => {
          try {
            await api.desfazerRegistro(registroId);
            mudou();
            avisar("Desfeito.");
          } catch (e) {
            avisar(mensagemDe(e), true);
          }
        },
      });
    },
    [avisar, mudou],
  );
  const receberPropostas = useCallback((ps: Proposta[]) => despachar({ tipo: "receber", propostas: ps }), []);

  const aprovar = useCallback(
    async (id: string, ajustes?: AjustesProposta) => {
      const r = await api.aprovarProposta(id, ajustes);
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

  // Em ref: a casca fica abaixo deste provedor, e trocar de tela não deve re-renderizar quem só usa o contexto.
  const navegar = useRef<((tela: AbaAtiva) => void) | null>(null);
  const registrarNavegacao = useCallback((ir: (tela: AbaAtiva) => void) => {
    navegar.current = ir;
    return () => {
      navegar.current = null;
    };
  }, []);
  const irParaTela = useCallback((tela: AbaAtiva) => navegar.current?.(tela), []);

  const valor = useMemo<Valor>(
    () => ({
      usuario,
      podeOperar: !!usuario && usuario.papel !== "viewer",
      demo,
      versao,
      mudou,
      avisar,
      avisarFeito,
      cartoes,
      receberPropostas,
      aprovar,
      recusar,
      desfazer,
      irParaTela,
      registrarNavegacao,
    }),
    [usuario, demo, versao, mudou, avisar, avisarFeito, cartoes, receberPropostas, aprovar, recusar, desfazer, irParaTela, registrarNavegacao],
  );

  return (
    <Ctx.Provider value={valor}>
      {children}
      <div aria-live="polite" role="status">
        {aviso && (
          <div
            key={aviso.id}
            className={`toast${aviso.erro ? " erro" : ""}`}
            onPointerEnter={segurarAviso}
            onPointerLeave={soltarAviso}
            onFocus={segurarAviso}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) soltarAviso();
            }}
          >
            <span className="toast-texto">{aviso.texto}</span>
            {aviso.acao ? <BotaoAviso acao={aviso.acao} fechar={() => setAviso(null)} /> : null}
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}

function BotaoAviso({ acao, fechar }: { acao: AcaoAviso; fechar: () => void }) {
  const [ocupado, setOcupado] = useState(false);
  return (
    <button
      type="button"
      className="toast-acao"
      disabled={ocupado}
      aria-busy={ocupado}
      onClick={async () => {
        setOcupado(true);
        fechar();
        await acao.fazer();
      }}
    >
      {acao.rotulo}
    </button>
  );
}
