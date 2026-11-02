"use client";
/**
 * O cabeçalho de todas as telas, no padrão aprovado no Orçamento:
 * - uma linha: título no tamanho de seção + selo; à direita, no máximo uma ação principal e o "⋯" com o resto;
 * - uma linha de resumo opcional (`sub`), curta;
 * - a faixa de números (FaixaNumeros): um número principal grande e, embaixo, os outros lado a lado, cada um com o
 *   rótulo em cima e o valor embaixo; valor nunca quebra linha;
 * - os filtros (BarraFiltros): numa linha no desktop; no celular, a busca e um botão que abre a gaveta com os grupos.
 * Nenhum número novo: cada tela só reorganiza o que já mostrava.
 */
import { useState, type ReactNode } from "react";
import { ChipEscolha } from "./ChipEscolha";
import { Drawer } from "./Dialogo";
import { Icone, type NomeIcone } from "./Icone";
import { MenuMais, type ItemMenu } from "./MenuMais";

/** Formato antigo (ícone + número + frase), ainda aceito: vira item da faixa. */
export interface Kpi {
  icone?: NomeIcone;
  n: ReactNode;
  r: ReactNode;
  tag?: ReactNode;
  tom?: "ok" | "atencao" | "acima" | "info";
}

export interface Numero {
  rotulo: ReactNode;
  valor: ReactNode;
  /** Texto pequeno ao lado do valor ("1,2%"). */
  sub?: ReactNode;
  /** Pílula ao lado do valor ("em dia", "pede você"). */
  tag?: ReactNode;
  tom?: "ok" | "atencao" | "acima" | "info";
}

export function CabecalhoPagina(props: {
  titulo: string;
  selo?: ReactNode;
  sub?: ReactNode;
  /** A ação principal à vista (uma só). */
  acao?: ReactNode;
  /** O resto das ações, no "⋯". */
  menu?: ItemMenu[];
  rotuloMenu?: string;
  /** Números: o principal grande e os demais embaixo. */
  principal?: Numero;
  numeros?: Numero[];
  rodapeNumeros?: ReactNode;
  /** Linha abaixo do cabeçalho: abas da tela, filtros. */
  barra?: ReactNode;
  /** Compatibilidade: kpis viram números da faixa; acoes viram a barra. */
  kpis?: Kpi[];
  acoes?: ReactNode;
}) {
  const numeros = props.numeros ?? (props.kpis ?? []).map((k) => ({ rotulo: k.r, valor: k.n, tag: k.tag, tom: k.tom }));
  const barra = props.barra ?? props.acoes;
  return (
    <>
      <header className="cab">
        <div className="cab-l1">
          <h1 className="cab-t">{props.titulo}</h1>
          {props.selo ? <span className="cab-selo">{props.selo}</span> : null}
          <span className="sp" />
          {props.acao}
          {props.menu?.length ? <MenuMais rotulo={props.rotuloMenu ?? `Mais ações: ${props.titulo}`} itens={props.menu} /> : null}
        </div>
        {props.sub ? <div className="cab-sub">{props.sub}</div> : null}
      </header>
      {props.principal || numeros.length ? <FaixaNumeros principal={props.principal} itens={numeros} rodape={props.rodapeNumeros} /> : null}
      {barra ? <div className="barra-acoes">{barra}</div> : null}
    </>
  );
}

const TOM = { ok: "ok", atencao: "warn", acima: "bad", info: "" } as const;

export function FaixaNumeros({ principal, itens, rodape }: { principal?: Numero; itens: Numero[]; rodape?: ReactNode }) {
  const tag = (n: Numero) => (n.tag ? <span className={`fx-tag${n.tom ? ` ${TOM[n.tom]}` : ""}`}>{n.tag}</span> : null);
  return (
    <section className={`faixa${principal ? "" : " sem-principal"}`} aria-label="Resumo">
      {principal ? (
        <div className="fx-principal">
          <span className="fx-rot">{principal.rotulo}</span>{" "}
          <span className="fx-linha">
            <span className="fx-grande">{principal.valor}</span>
            {principal.sub ? <small>{principal.sub}</small> : null}
            {tag(principal)}
          </span>
        </div>
      ) : null}
      {itens.length ? (
        <dl className="fx-itens" style={{ "--fx-n": itens.length } as React.CSSProperties}>
          {itens.map((n, i) => (
            <div key={i}>
              {/* rótulo de texto com reticências se não couber (nunca sobrepõe o vizinho) */}
              <dt>{typeof n.rotulo === "string" ? <span className="fx-rt">{n.rotulo}</span> : n.rotulo}</dt>
              <dd>
                {" "}
                <span className="fx-valor">{n.valor}</span>
                {n.sub ? <small>{n.sub}</small> : null}
                {tag(n)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {rodape ? <div className="fx-rodape">{rodape}</div> : null}
    </section>
  );
}

export interface GrupoFiltro<K extends string | null = string | null> {
  rotulo: string;
  valor: K;
  opcoes: { k: K; rotulo: string }[];
  mudar: (k: K) => void;
}

/**
 * Filtros numa linha: busca (opcional) + um chip com menu por grupo. No celular os chips somem e um botão abre a
 * gaveta com os mesmos grupos; um ponto no botão avisa que há filtro ativo (fora do primeiro valor de algum grupo).
 */
export function BarraFiltros(props: { busca?: { valor: string; mudar: (t: string) => void; placeholder: string; rotulo: string }; grupos: GrupoFiltro<any>[]; extra?: ReactNode }) {
  const [gaveta, setGaveta] = useState(false);
  const ativo = props.grupos.some((g) => g.valor !== g.opcoes[0]!.k);
  return (
    <div className={`filtros${props.busca ? "" : " sem-busca"}`}>
      {props.busca ? (
        <label className="busca">
          <Icone nome="busca" tam={16} />
          <span className="sr-only">{props.busca.rotulo}</span>
          <input type="search" placeholder={props.busca.placeholder} value={props.busca.valor} onChange={(e) => props.busca!.mudar(e.target.value)} />
        </label>
      ) : null}
      <span className="filtros-chips">
        {props.grupos.map((g) => (
          <ChipEscolha key={g.rotulo} rotulo={g.rotulo} valor={g.valor} opcoes={g.opcoes} mudar={g.mudar} />
        ))}
      </span>
      {props.grupos.length ? (
        <button type="button" className="filtros-b" aria-label={`Filtros${ativo ? " (ativos)" : ""}`} aria-haspopup="dialog" onClick={() => setGaveta(true)}>
          <Icone nome="filtro" tam={18} />
          {!props.busca ? <span className="filtros-b-t">Filtros</span> : null}
          {ativo ? <span className="filtros-ponto" aria-hidden="true" /> : null}
        </button>
      ) : null}
      {props.extra}
      {gaveta ? (
        <Drawer titulo="Filtros" fechar={() => setGaveta(false)}>
          {props.grupos.map((g) => (
            <fieldset key={g.rotulo} className="le-g-grupo">
              <legend>{g.rotulo}</legend>
              {g.opcoes.map((o) => (
                <label key={String(o.k)} className="le-g-op">
                  <input type="radio" name={`f-${g.rotulo}`} checked={g.valor === o.k} onChange={() => g.mudar(o.k)} />
                  {o.rotulo}
                </label>
              ))}
            </fieldset>
          ))}
          <div className="form-acoes">
            {ativo ? (
              <button type="button" className="btn" onClick={() => props.grupos.forEach((g) => g.mudar(g.opcoes[0]!.k))}>
                Limpar
              </button>
            ) : null}
            <button type="button" className="btn amb" onClick={() => setGaveta(false)}>
              Ver resultado
            </button>
          </div>
        </Drawer>
      ) : null}
    </div>
  );
}
