import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MensagemMarkdown, completarParcial, urlSegura } from "./MensagemMarkdown";

describe("Markdown do agente", () => {
  it("parágrafos, quebras, listas, negrito, itálico, tabela e código inline", () => {
    const { container } = render(
      <MensagemMarkdown
        texto={"Falta **640 un** de bloco.\nConta abaixo.\n\n- um\n- dois\n- três\n\n*itálico* e `código`\n\n| insumo | falta |\n|---|---|\n| bloco | 640 |"}
      />,
    );
    expect(container.querySelectorAll("p").length).toBe(2);
    expect(container.querySelector("p br")).not.toBeNull();
    expect(container.querySelector("b")).toHaveTextContent("640 un");
    expect(container.querySelectorAll("ul li").length).toBe(3);
    expect(container.querySelector("em")).toHaveTextContent("itálico");
    expect(container.querySelector("code")).toHaveTextContent("código");
    expect(container.querySelector(".md-tabela table td")).toHaveTextContent("bloco");
  });

  it("sem HTML cru, sem imagem, link só http/https em outra aba", () => {
    const { container } = render(
      <MensagemMarkdown
        texto={'<script>alert(1)</script><b onclick="x">cru</b>\n\n![foto](https://x.example/a.png)\n\n[ok](https://canteiro.example) [mal](javascript:alert(1))'}
      />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("[onclick]")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    const links = container.querySelectorAll("a");
    expect(links.length).toBe(1);
    expect(links[0]).toHaveAttribute("href", "https://canteiro.example/");
    expect(links[0]).toHaveAttribute("target", "_blank");
    expect(links[0]).toHaveAttribute("rel", "noopener noreferrer");
    expect(container).toHaveTextContent("mal");
    expect(urlSegura("data:text/html,x")).toBe("");
  });

  it("títulos grandes viram subtítulo", () => {
    const { container } = render(<MensagemMarkdown texto={"# Grande\n\n## Médio"} />);
    expect(container.querySelector("h1,h2")).toBeNull();
    expect(container.querySelectorAll("h3").length).toBe(2);
  });
});

describe("streaming com Markdown incompleto", () => {
  it("fecha o que o corte deixou aberto", () => {
    expect(completarParcial("O bloco: **falta ")).toBe("O bloco: **falta** ");
    expect(completarParcial("O bloco: **")).toBe("O bloco: ");
    expect(completarParcial("O bloco: *")).toBe("O bloco: ");
    expect(completarParcial("veja `cod")).toBe("veja `cod`");
    expect(completarParcial("```\nx = 1")).toBe("```\nx = 1\n```");
    expect(completarParcial("**ok** pronto")).toBe("**ok** pronto");
    expect(completarParcial("- a\n- b")).toBe("- a\n- b");
  });

  it("a cada delta (corte no meio de **) nunca mostra asterisco solto e o negrito não pisca", () => {
    const final = "Vou conferir o almoxarifado.\n\nO bloco: **falta 640 un**.\n\nprecisa 3.400 − saldo 2.760 = **falta 640 un**";
    const { container, rerender } = render(<MensagemMarkdown texto="" vivo />);
    // corta em todas as posições, inclusive entre os dois "*" de "**"
    for (let i = 1; i <= final.length; i++) {
      rerender(<MensagemMarkdown texto={final.slice(0, i)} vivo />);
      expect(container.textContent).not.toContain("*");
    }
    rerender(<MensagemMarkdown texto={final} />);
    expect(container.querySelectorAll("b").length).toBe(2);
    expect(container.querySelectorAll("p").length).toBe(3);
  });

  it("deltas de blocos diferentes se juntam sem nada no meio (a separação vem no texto)", () => {
    const deltas = ["Vou conferir o almoxarifado.\n\n", "O cimento ", "tem **12 sc**."];
    const { container } = render(<MensagemMarkdown texto={deltas.join("")} />);
    const ps = container.querySelectorAll("p");
    expect(ps.length).toBe(2);
    expect(ps[1]).toHaveTextContent("O cimento tem 12 sc.");
  });
});
