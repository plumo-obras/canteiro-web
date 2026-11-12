"use client";
/**
 * Cabeçalho do Orçamento e de Compras como no protótipo: título grande e uma linha de contexto à esquerda; à direita,
 * embaixo, o botão do Plumo em ocre suave, as ações e o "⋯". No celular sobra o título com o selo e o "⋯" (o Plumo vai
 * para o pé da tela e o contexto já está nos números). Não reaproveita o CabecalhoPagina porque lá o título é de
 * seção e as ações dividem a linha com ele; aqui elas ficam alinhadas ao pé do bloco de texto.
 */
import type { ReactNode } from "react";
import { MenuMais, type ItemMenu } from "../MenuMais";
import { useCelular } from "../midia";
import s from "./cabecalho-tela.module.css";

export function CabecalhoTela(props: {
  titulo: string;
  contexto?: ReactNode;
  /** Só no celular, ao lado do título (no computador o estado está na linha de contexto). */
  selo?: ReactNode;
  /** Botões à direita, no computador. */
  acoes?: ReactNode;
  menu?: ItemMenu[];
  rotuloMenu?: string;
}) {
  const celular = useCelular();
  const menu = props.menu?.length ? <MenuMais rotulo={props.rotuloMenu ?? `Mais ações: ${props.titulo}`} itens={props.menu} /> : null;
  if (celular)
    return (
      <header className={s.cab}>
        <h1 className={s.titulo}>{props.titulo}</h1>
        <span className={s.esp} />
        {props.selo}
        {menu}
      </header>
    );
  return (
    <header className={s.cab}>
      <div className={s.texto}>
        <h1 className={s.titulo}>{props.titulo}</h1>
        {props.contexto ? <p className={s.contexto}>{props.contexto}</p> : null}
      </div>
      <div className={s.acoes}>
        {props.acoes}
        {menu}
      </div>
    </header>
  );
}
