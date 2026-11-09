import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { USUARIO } from "@/testes/rede";
import { ProvedorCasca, useCasca } from "./contexto";
import { ProximoPasso } from "./ProximoPasso";
import type { AbaAtiva } from "./sessoes";

function CascaFalsa({ ir }: { ir: (t: AbaAtiva) => void }) {
  const { registrarNavegacao } = useCasca();
  useEffect(() => registrarNavegacao(ir), [registrarNavegacao, ir]);
  return null;
}
const montar = (ir: (t: AbaAtiva) => void, para: AbaAtiva) =>
  render(
    <ProvedorCasca usuario={USUARIO} demo={false}>
      <CascaFalsa ir={ir} />
      <ProximoPasso obraId="o 1" para={para} acao="Seguir" titulo="Pronto." texto="Veja a próxima tela." />
    </ProvedorCasca>,
  );

describe("ProximoPasso", () => {
  it("o clique troca a tela na casca, e o link segue valendo para abrir em outra aba", async () => {
    const ir = vi.fn();
    montar(ir, "suprimentos");
    const link = screen.getByRole("link", { name: "Seguir" });
    expect(link).toHaveAttribute("href", "/?obra=o+1&tela=suprimentos");
    await userEvent.setup().click(link);
    expect(ir).toHaveBeenCalledWith("suprimentos");
  });

  it("a conversa é a obra sem ?tela", () => {
    montar(vi.fn(), "conversa");
    expect(screen.getByRole("link", { name: "Seguir" })).toHaveAttribute("href", "/?obra=o+1");
  });
});
