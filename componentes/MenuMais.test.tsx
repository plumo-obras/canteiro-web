import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MenuMais } from "./MenuMais";

const itens = [{ rotulo: "Recusar…", acao: vi.fn() }];
const rolar = () => act(() => void document.dispatchEvent(new Event("scroll")));

describe("menu ⋯ e a rolagem", () => {
  it("o 'scroll' atrasado da rolagem que levou até o botão não fecha o menu recém-aberto", () => {
    render(<MenuMais itens={itens} />);
    fireEvent.click(screen.getByRole("button", { name: "Mais ações" }), { detail: 1 });
    rolar();
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("rolagem que tira o botão do lugar fecha (o menu fixo ficaria solto na tela)", () => {
    render(<MenuMais itens={itens} />);
    const b = screen.getByRole("button", { name: "Mais ações" });
    fireEvent.click(b, { detail: 1 });
    vi.spyOn(b, "getBoundingClientRect").mockReturnValue({ left: 0, top: -40, right: 28, bottom: -12, width: 28, height: 28, x: 0, y: -40, toJSON: () => ({}) });
    rolar();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("aberto pelo mouse (foco no botão), o Esc fecha", () => {
    render(<MenuMais itens={itens} />);
    const b = screen.getByRole("button", { name: "Mais ações" });
    fireEvent.click(b, { detail: 1 });
    fireEvent.keyDown(b, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
