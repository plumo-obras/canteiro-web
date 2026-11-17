"use client";
/**
 * O Plumo fora das abas: o campo "Pergunte ao Plumo" no topo e o painel da conversa, que abre ao lado da tela (a tela
 * continua à vista). A conversa fica montada com o painel fechado, para o texto digitado e o "Parar" sobreviverem.
 * A lista das conversas mora dentro do painel, no botão "Conversas".
 */
import { Fragment, useEffect, useRef, useState, type Dispatch, type RefObject } from "react";
import type { Obra, ResumoDaObra } from "@/lib/contrato";
import { Conversa, type PedidoConversa } from "../Conversa";
import { Icone } from "../Icone";
import { paradasDoTab, proximaParada } from "../foco";
import type { AcaoSessoes, Sessao } from "../sessoes";
import s from "./plumo.module.css";

/** "Hoje", "Esta semana", "Este mês" ou o mês por extenso: os grupos da lista de conversas, das mais novas às mais velhas. */
export function grupoDaData(iso: string, agora = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Mais antigas";
  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = Math.round((dia(agora) - dia(d)) / 86400000);
  if (dias <= 0) return "Hoje";
  if (dias < 7) return "Esta semana";
  if (d.getFullYear() === agora.getFullYear() && d.getMonth() === agora.getMonth()) return "Este mês";
  const mes = new Intl.DateTimeFormat("pt-BR", { month: "long", ...(d.getFullYear() === agora.getFullYear() ? {} : { year: "numeric" }) }).format(d);
  return mes[0]!.toUpperCase() + mes.slice(1);
}

/** ⌘K no Mac, Ctrl+K nos outros: o atalho que o campo mostra é o que funciona ali. */
function atalho(): string {
  if (typeof navigator === "undefined") return "Ctrl K";
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘K" : "Ctrl K";
}

/** O campo do topo: Enter manda a pergunta para a conversa aberta e abre o painel; vazio, só abre. */
export function CampoPlumo({ perguntar, campo }: { perguntar: (texto: string) => void; campo: RefObject<HTMLInputElement | null> }) {
  const [texto, setTexto] = useState("");
  const [tecla, setTecla] = useState("Ctrl K");
  useEffect(() => setTecla(atalho()), []);
  return (
    <form
      className={s.campo}
      role="search"
      aria-label="Pergunte ao Plumo"
      onSubmit={(e) => {
        e.preventDefault();
        perguntar(texto.trim());
        setTexto("");
      }}
    >
      <Icone nome="spark" tam={16} />
      <label htmlFor="campo-plumo" className="sr-only">
        Pergunte ao Plumo
      </label>
      <input
        id="campo-plumo"
        ref={campo}
        type="text"
        autoComplete="off"
        placeholder="Pergunte ao Plumo…"
        aria-describedby="campo-plumo-dica"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") e.currentTarget.blur();
        }}
      />
      <kbd className={s.tecla} aria-hidden="true">
        {tecla}
      </kbd>
      <span id="campo-plumo-dica" className="sr-only">
        Enter abre a conversa com o Plumo ao lado da tela.
      </span>
    </form>
  );
}

export interface PropsPainel {
  aberto: boolean;
  /** Celular e tablet: o painel cobre a tela (folha modal, Tab preso dentro dela). */
  modal: boolean;
  fechar: () => void;
  sessao: Sessao;
  obra: Obra;
  resumo: ResumoDaObra | null;
  despachar: Dispatch<AcaoSessoes>;
  /** As conversas desta obra, das mais novas às mais velhas. */
  conversas: Sessao[];
  escolher: (id: string) => void;
  abrirNova: () => void;
  maisAntigas: { existe: boolean; buscando: boolean; carregar: () => void };
  pedido: PedidoConversa | null;
  atenderPedido: () => void;
  demo: boolean;
}

export function PainelPlumo(p: PropsPainel) {
  const { aberto, modal, fechar } = p;
  const [lista, setLista] = useState(false);
  const [busca, setBusca] = useState("");
  const caixa = useRef<HTMLElement>(null);

  // Esc fecha; na folha modal o Tab fica dentro dela. Um diálogo aberto por cima (confirmar uma proposta) cuida do
  // próprio Esc: o painel não fecha junto.
  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const dentroDeOutro = (e.target as Element | null)?.closest?.("[role=dialog]:not(#painel-plumo)");
      if (e.key === "Escape" && !dentroDeOutro && !document.querySelector(".modal,.drawer")) {
        if (lista) setLista(false);
        else fechar();
        return;
      }
      if (modal && e.key === "Tab" && caixa.current) {
        const prox = proximaParada(paradasDoTab(caixa.current), document.activeElement, e.shiftKey);
        if (prox) {
          e.preventDefault();
          prox.focus();
        }
      }
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [aberto, modal, fechar, lista]);

  // Ao trocar de conversa (pela lista ou por "Nova"), volta para a conversa.
  useEffect(() => setLista(false), [p.sessao.id]);

  const q = busca.trim().toLowerCase();
  // A conversa nova e vazia já é o botão "Nova conversa": não entra na lista duas vezes.
  const visiveis = p.conversas.filter((x) => !(x.carregada && x.mensagens.length === 0)).filter((x) => !q || x.titulo.toLowerCase().includes(q));
  let grupoAnterior = "";

  return (
    <>
      {modal && aberto ? <div className={s.veu} aria-hidden="true" onClick={fechar} /> : null}
      <aside
        id="painel-plumo"
        ref={caixa}
        className={`${s.painel}${modal ? ` ${s.modal}` : ""}`}
        aria-label="Plumo"
        role={modal ? "dialog" : "complementary"}
        aria-modal={modal ? true : undefined}
        hidden={!aberto}
        inert={!aberto}
      >
        <header className={s.cab}>
          <button
            type="button"
            className={`tr-btn${lista ? " on" : ""}`}
            aria-label={lista ? "Voltar para a conversa" : "Conversas"}
            title={lista ? "Voltar para a conversa" : "Conversas"}
            aria-expanded={lista}
            onClick={() => setLista((l) => !l)}
          >
            <Icone nome={lista ? "chevRight" : "painel"} tam={18} className={lista ? s.voltar : undefined} />
          </button>
          <h2 className={s.titulo} title={lista ? undefined : p.sessao.titulo}>
            {lista ? "Conversas" : p.sessao.titulo}
          </h2>
          <button type="button" className="tr-btn" aria-label="Nova conversa" title="Nova conversa" onClick={p.abrirNova}>
            <Icone nome="plus" tam={18} />
          </button>
          <button type="button" className="tr-btn" aria-label="Fechar o Plumo" title="Fechar (Esc)" onClick={fechar}>
            <Icone nome="x" tam={18} />
          </button>
        </header>

        <div className={s.lista} hidden={!lista}>
          <label className="busca">
            <Icone nome="busca" tam={15} />
            <span className="sr-only">Buscar nas conversas</span>
            <input type="search" placeholder="Buscar nas conversas" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </label>
          <div className={s.itens}>
            {q && !visiveis.length ? <p className={s.vazio}>Nenhuma conversa com «{busca.trim()}».</p> : null}
            {!q && !visiveis.length ? <p className={s.vazio}>Nenhuma conversa ainda nesta obra.</p> : null}
            {visiveis.map((x) => {
              const grupo = grupoDaData(x.atualizadoEm);
              const cab = grupo !== grupoAnterior ? grupo : null;
              grupoAnterior = grupo;
              return (
                <Fragment key={x.id}>
                  {cab ? <p className={s.grupo}>{cab}</p> : null}
                  <button type="button" className={`${s.item}${x.id === p.sessao.id ? ` ${s.on}` : ""}`} aria-current={x.id === p.sessao.id ? "true" : undefined} title={x.titulo} onClick={() => p.escolher(x.id)}>
                    <span className={s.itemT}>{x.titulo}</span>
                  </button>
                </Fragment>
              );
            })}
            {p.maisAntigas.existe ? (
              <button type="button" className={s.mais} disabled={p.maisAntigas.buscando} aria-busy={p.maisAntigas.buscando} onClick={p.maisAntigas.carregar}>
                {p.maisAntigas.buscando ? <Icone nome="loader" className="spin" tam={14} /> : null}
                Conversas mais antigas
              </button>
            ) : null}
          </div>
          {p.demo ? (
            <div className="fict" role="note">
              <Icone nome="info" tam={14} />
              <span>Modo de demonstração: dados fictícios, em memória. Nada vai para a API.</span>
            </div>
          ) : null}
        </div>

        <div className={s.conversa} hidden={lista}>
          <Conversa key={p.sessao.id} sessao={p.sessao} obra={p.obra} resumo={p.resumo} despachar={p.despachar} pedido={p.pedido} atenderPedido={p.atenderPedido} />
        </div>
      </aside>
    </>
  );
}
