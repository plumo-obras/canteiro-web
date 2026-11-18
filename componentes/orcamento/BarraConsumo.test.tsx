import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BarraConsumo, fraseDoConsumo, tomDoConsumo } from "./BarraConsumo";

describe("barra de consumo do orçado", () => {
  it("o tom segue o significado das cores: nada, normal, perto do orçado (90%) e acima dele", () => {
    expect(tomDoConsumo(18_000_00, 0)).toBe("nada");
    expect(tomDoConsumo(18_000_00, 15_050_00)).toBe("normal");
    expect(tomDoConsumo(18_000_00, 16_200_00)).toBe("perto");
    expect(tomDoConsumo(42_000_00, 44_670_00)).toBe("estouro");
    expect(tomDoConsumo(0, 100)).toBe("estouro");
  });

  it("a frase diz a barra em palavras, com o que passou vindo do saldo da API", () => {
    expect(fraseDoConsumo(18_000_00, 15_050_00, 2_950_00)).toBe("84% do orçado");
    expect(fraseDoConsumo(42_000_00, 44_670_00, -2_670_00)).toBe("passou R$ 2.670,00 do orçado (106%)");
    expect(fraseDoConsumo(48_000_00, 0, 48_000_00)).toBe("nada gasto");
  });

  it("o leitor de tela ouve a frase, e o que passou do orçado aparece como um segmento à parte", () => {
    const { container } = render(<BarraConsumo orcado={42_000_00} gasto={44_670_00} saldo={-2_670_00} />);
    expect(screen.getByRole("img", { name: "Consumo do orçado: passou R$ 2.670,00 do orçado (106%)" })).toBeInTheDocument();
    // o estouro começa na marca de 100% (a 80% do trilho) e mede os 6,4% que passaram, na mesma escala
    const passou = [...container.querySelectorAll<HTMLElement>("span[style]")].find((e) => e.style.left === "80%" && e.style.width);
    expect(passou?.style.width).toMatch(/^5\.08/);
  });
});
