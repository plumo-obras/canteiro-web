"use client";
/**
 * O secundário do cabeçalho das telas, em ocre suave: leva à conversa com o Plumo. Some no celular, onde a aba Plumo
 * já está na barra de baixo e o cabeçalho não tem espaço para dois botões.
 */
import { useCasca } from "./contexto";
import { Icone } from "./Icone";
import s from "./botao-plumo.module.css";

export function BotaoPlumo({ rotulo }: { rotulo: string }) {
  const { irParaTela } = useCasca();
  return (
    <button type="button" className={`btn ${s.plumo}`} onClick={() => irParaTela("conversa")}>
      <Icone nome="spark" tam={15} />
      {rotulo}
    </button>
  );
}
