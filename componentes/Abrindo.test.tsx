import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Abrindo } from "./Abrindo";

describe("Abrindo", () => {
  it("só anuncia que está abrindo enquanto o servidor não falhou", () => {
    render(<Abrindo semServidor={false} tentarAgora={() => undefined} />);
    expect(screen.getByRole("status")).toHaveTextContent("Abrindo o Plumo…");
    expect(screen.queryByRole("button", { name: "Tentar agora" })).toBeNull();
  });

  it("sem servidor, diz o que houve e dá saída", async () => {
    const tentar = vi.fn();
    render(<Abrindo semServidor tentarAgora={tentar} />);
    expect(screen.getByRole("status")).toHaveTextContent("O servidor não respondeu.");
    // Os botões ficam fora da região viva.
    expect(screen.getByRole("status")).not.toContainElement(screen.getByRole("button", { name: "Tentar agora" }));
    await userEvent.click(screen.getByRole("button", { name: "Tentar agora" }));
    expect(tentar).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "Entrar de novo" })).toHaveAttribute("href", "/entrar");
  });
});
