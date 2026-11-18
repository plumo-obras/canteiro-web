import { connection } from "next/server";
import { Casca } from "@/componentes/Casca";
import { modoDemo, semPedidos } from "@/lib/servidor/config";

export default async function Inicio() {
  await connection(); // o modo vem do ambiente em tempo de execução, não do build
  return <Casca demo={modoDemo()} semPedidos={semPedidos()} />;
}
