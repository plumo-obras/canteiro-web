import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChipEscolha } from "./ChipEscolha";

describe("ChipEscolha", () => {
  it("o menu abre num portal no body, com position fixed (não dentro do contêiner com overflow)", async () => {
    const { container } = render(
      <div style={{ overflow: "auto" }} data-testid="caixa">
        <ChipEscolha rotulo="Mostrar" valor="todas" opcoes={[{ k: "todas", rotulo: "Todas" }, { k: "atrasadas", rotulo: "Atrasadas" }]} mudar={() => undefined} />
      </div>,
    );
    await userEvent.click(screen.getByRole("button", { name: /Mostrar/ }));
    const menu = screen.getByRole("menu", { name: "Mostrar" });
    expect(container.contains(menu)).toBe(false);
    expect(menu.parentElement).toBe(document.body);
    expect(menu.style.position).toBe("fixed");
    expect(screen.getByRole("menuitemradio", { name: "Todas" }).getAttribute("aria-checked")).toBe("true");
  });
});
