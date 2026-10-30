import type { Metadata } from "next";
import { connection } from "next/server";
import { ContaPagina } from "@/componentes/conta/ContaPagina";
import { modoDemo } from "@/lib/servidor/config";

export const metadata: Metadata = { title: "Conta · Canteiro" };

export default async function Pagina() {
  await connection();
  return <ContaPagina demo={modoDemo()} />;
}
