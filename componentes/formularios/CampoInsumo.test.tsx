import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { ItemInsumo } from "@/lib/contrato";
import { CampoInsumo, type EscolhaInsumo } from "./CampoInsumo";

const item = (id: string, nome: string): ItemInsumo => ({
  insumo: { id, tenant_id: "t", criado_em: "", obra_id: "o", nome, unidade: "sc", precisa_ate_o_fim: 0, curva: "C" },
  conta: { precisa: 0, saldo: 46_000, a_caminho: 0, cotando: 0, transferencia: 0, falta: 0, comprar: 0 },
});
const itens = [item("c", "Cimento CP-II 50 kg"), item("a", "Areia média lavada")];

function Montado({ permitirNovo, aoMudar }: { permitirNovo: boolean; aoMudar: (v: EscolhaInsumo) => void }) {
  const [v, setV] = useState<EscolhaInsumo>(null);
  return (
    <CampoInsumo
      a={{ id: "x", "aria-invalid": false }}
      itens={itens}
      valor={v}
      mudar={(n) => {
        setV(n);
        aoMudar(n);
      }}
      permitirNovo={permitirNovo}
      dicaSemNovo="Material novo entra pela aba Entrada."
    />
  );
}

describe("campo de insumo digitável", () => {
  it("filtra sem acento e escolhe com Enter", async () => {
    const mudar = vi.fn();
    render(<Montado permitirNovo={false} aoMudar={mudar} />);
    await userEvent.type(screen.getByRole("combobox"), "areia media");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([expect.stringContaining("Areia média lavada")]);
    await userEvent.keyboard("{Enter}");
    expect(mudar).toHaveBeenLastCalledWith({ tipo: "existente", id: "a" });
  });

  it("nome que não existe vira cadastro quando permitido", async () => {
    const mudar = vi.fn();
    render(<Montado permitirNovo aoMudar={mudar} />);
    await userEvent.type(screen.getByRole("combobox"), "Cal  hidratada");
    await userEvent.click(screen.getByRole("option", { name: /Cadastrar/ }));
    expect(mudar).toHaveBeenLastCalledWith({ tipo: "novo", nome: "Cal hidratada" });
  });

  it("sem cadastro, explica o que fazer", async () => {
    render(<Montado permitirNovo={false} aoMudar={vi.fn()} />);
    await userEvent.type(screen.getByRole("combobox"), "prego");
    expect(screen.queryByRole("option")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Material novo entra pela aba Entrada.");
  });

  it("digitar o nome exato já escolhe o insumo", async () => {
    const mudar = vi.fn();
    render(<Montado permitirNovo aoMudar={mudar} />);
    await userEvent.type(screen.getByRole("combobox"), "cimento cp-ii 50 kg");
    expect(mudar).toHaveBeenLastCalledWith({ tipo: "existente", id: "c" });
    expect(screen.queryByRole("option", { name: /Cadastrar/ })).toBeNull();
  });
});
