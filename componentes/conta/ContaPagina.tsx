"use client";
import { Moldura } from "../inicio/Moldura";
import { Conta } from "./Conta";

export function ContaPagina({ demo }: { demo: boolean }) {
  return (
    <Moldura demo={demo} rota="conta">
      {(u) => <Conta usuario={u} />}
    </Moldura>
  );
}
