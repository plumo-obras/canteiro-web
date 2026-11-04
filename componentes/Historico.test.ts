import { describe, expect, it } from "vitest";
import type { EntradaRegistro } from "@/lib/contrato";
import { mostrarAutor } from "./Historico";

const reg = (quem: string, origem = "tela"): EntradaRegistro => ({ id: quem + origem, quem, origem } as EntradaRegistro);

describe("Histórico: autor só quando muda", () => {
  it("autor na 1ª linha, quando muda e sempre que é o agente", () => {
    expect(mostrarAutor(reg("Ana"), undefined)).toBe(true);
    expect(mostrarAutor(reg("Ana"), reg("Ana"))).toBe(false);
    expect(mostrarAutor(reg("Bia"), reg("Ana"))).toBe(true);
    expect(mostrarAutor(reg("Ana", "agente"), reg("Ana", "agente"))).toBe(true);
  });
});
