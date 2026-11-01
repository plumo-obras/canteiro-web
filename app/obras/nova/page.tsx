import type { Metadata } from "next";
import { connection } from "next/server";
import { NovaObraPagina } from "@/componentes/obra/NovaObra";
import { modoDemo } from "@/lib/servidor/config";

export const metadata: Metadata = { title: "Nova obra · Plumo" };

export default async function Pagina() {
  await connection(); // o modo vem do ambiente em tempo de execução, não do build
  return <NovaObraPagina demo={modoDemo()} />;
}
