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

  it("aberto pelo mouse, o foco vai para o 1º item; Esc fecha e devolve o foco ao botão", () => {
    render(<MenuMais itens={[...itens, { rotulo: "Ajustar…", acao: vi.fn() }]} />);
    const b = screen.getByRole("button", { name: "Mais ações" });
    fireEvent.click(b, { detail: 1 });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Recusar…" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(b);
  });

  it("com o foco fora do menu e do botão (o Safari não foca o botão no clique), o Esc ainda fecha", () => {
    render(<MenuMais itens={itens} />);
    const b = screen.getByRole("button", { name: "Mais ações" });
    fireEvent.click(b, { detail: 1 });
    act(() => (document.activeElement as HTMLElement).blur());
    expect(document.activeElement).toBe(document.body);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(b);
  });

  it("Esc no botão com o menu aberto fecha", () => {
    render(<MenuMais itens={itens} />);
    const b = screen.getByRole("button", { name: "Mais ações" });
    fireEvent.click(b, { detail: 1 });
    act(() => b.focus());
    fireEvent.keyDown(b, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
