"use client";
/**
 * O fim de cada tela da obra: uma faixa só, dizendo o que vem depois. É o que guia a pessoa pelo fluxo sem passos
 * numerados nem assistente. `Faixa` é só o desenho (o cartão dos materiais das pranchas usa o mesmo); `ProximoPasso`
 * é a faixa com o link para a outra tela.
 */
import type { ReactNode, Ref } from "react";
import { useCasca } from "./contexto";
import type { AbaAtiva } from "./sessoes";
import s from "./proximo-passo.module.css";

export function Faixa({ titulo, texto, rotulo, children }: { titulo: ReactNode; texto?: ReactNode; rotulo?: string; children: ReactNode }) {
  return (
    <section className={`card ${s.faixa}`} aria-label={rotulo}>
      <p className={s.frase}>
        <b>{titulo}</b>
        {texto ? <span className="mut"> {texto}</span> : null}
      </p>
      <div className={s.acoes}>{children}</div>
    </section>
  );
}

/** Link de verdade, para abrir em outra aba com Ctrl/⌘; o clique simples troca a tela sem recarregar. */
export function LinkTela(props: { obraId: string; para: AbaAtiva; secundario?: boolean; ref?: Ref<HTMLAnchorElement>; children: ReactNode }) {
  const { irParaTela } = useCasca();
  const busca = new URLSearchParams({ obra: props.obraId, tela: props.para });
  return (
    <a
      ref={props.ref}
      className={props.secundario ? "btn" : "btn amb"}
      href={`/?${busca}`}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        irParaTela(props.para);
      }}
    >
      {props.children}
    </a>
  );
}

export function ProximoPasso(props: { obraId: string; para: AbaAtiva; acao: string; titulo: ReactNode; texto?: ReactNode; secundario?: boolean }) {
  return (
    <Faixa titulo={props.titulo} texto={props.texto} rotulo="Próximo passo">
      <LinkTela obraId={props.obraId} para={props.para} secundario={props.secundario}>
        {props.acao}
      </LinkTela>
    </Faixa>
  );
}
