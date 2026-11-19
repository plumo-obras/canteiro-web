"use client";
import { Inicio } from "./Inicio";
import { Moldura } from "./Moldura";

/** A página é server component; a função que monta o conteúdo com o usuário precisa nascer do lado do cliente. */
export function InicioPagina({ demo }: { demo: boolean }) {
  return (
    <Moldura demo={demo} rota="inicio">
      {(u) => <Inicio usuario={u} />}
    </Moldura>
  );
}
