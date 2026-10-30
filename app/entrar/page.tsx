import type { Metadata } from "next";
import { connection } from "next/server";
import { FormEntrar } from "@/componentes/FormEntrar";
import { modoDemo } from "@/lib/servidor/config";

export const metadata: Metadata = { title: "Entrar · Canteiro" };

export default async function Entrar() {
  await connection();
  return <FormEntrar demo={modoDemo()} />;
}
