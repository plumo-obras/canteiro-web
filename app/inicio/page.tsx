import type { Metadata } from "next";
import { connection } from "next/server";
import { InicioPagina } from "@/componentes/inicio/InicioPagina";
import { modoDemo } from "@/lib/servidor/config";

export const metadata: Metadata = { title: "Início · Canteiro" };

export default async function Pagina() {
  await connection(); // o modo vem do ambiente em tempo de execução, não do build
  return <InicioPagina demo={modoDemo()} />;
}
