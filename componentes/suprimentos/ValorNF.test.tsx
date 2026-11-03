import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Pedido, Usuario } from "@/lib/contrato";
import { ProvedorCasca } from "../contexto";
import { ModalRecebimento } from "./DetalhePedido";

// O caso do engenheiro: PED com 2 linhas, a 1ª já recebida (cimento), 2ª entrega da areia com NF de R$ 3.600,00.
const pedido = {
  id: "p", numero: "PED-0169", obra_id: "o", fornecedor: "Vale do Taquari", fornecedor_id: null, previsao: null, observacao: "", status: "parcial",
  valor: 810_000, recebimentos: 1, criado_em: "",
  linhas: [
    { insumo_id: "c", nome: "Cimento CP-II", unidade: "sc", tipo: "material", etapa: "3", quantidade: 120_000, valor_unitario: 3_750, total: 450_000, recebida: 120_000 },
    { insumo_id: "a", nome: "Areia média", unidade: "m³", tipo: "material", etapa: "3", quantidade: 30_000, valor_unitario: 12_000, total: 360_000, recebida: 0 },
  ],
} as Pedido;
const eu: Usuario = { id: "u", nome: "Eng", tenant_id: "t", papel: "admin" };
const montar = () =>
  render(
    <ProvedorCasca usuario={eu} demo={false}>
      <ModalRecebimento pedido={pedido} fechar={() => undefined} />
    </ProvedorCasca>,
  );

describe("Registrar entrega: Valor da NF", () => {
  it("digitar 3.600,00 fica exatamente 3.600,00 (sem caractere a mais), também depois de sair do campo", async () => {
    montar();
    const campo = screen.getByLabelText("Valor da NF (R$)") as HTMLInputElement;
    await userEvent.type(campo, "3.600,00");
    expect(campo.value).toBe("3.600,00");
    await userEvent.tab();
    expect(campo.value).toBe("3.600,00");
  });

  it("um zero a mais (3.600,000) não passa calado: o erro aparece ao sair do campo, não só ao gravar", async () => {
    montar();
    const campo = screen.getByLabelText("Valor da NF (R$)") as HTMLInputElement;
    await userEvent.type(campo, "3.600,000");
    await userEvent.tab();
    expect(campo.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText(/Valor da NF em reais/)).toBeTruthy();
  });

  it("valor sem formatação vira o formato do Real ao sair do campo (3600 → 3.600,00)", async () => {
    montar();
    const campo = screen.getByLabelText("Valor da NF (R$)") as HTMLInputElement;
    await userEvent.type(campo, "3600");
    await userEvent.tab();
    expect(campo.value).toBe("3.600,00");
  });

  it("com o Valor da NF inválido, Registrar fica desabilitado; corrigido, volta a ficar ativo", async () => {
    montar();
    const campo = screen.getByLabelText("Valor da NF (R$)") as HTMLInputElement;
    const registrar = () => screen.getByRole("button", { name: /Registrar entrega ·/ }) as HTMLButtonElement;
    expect(registrar().disabled).toBe(false);
    await userEvent.type(campo, "3.600,000");
    expect(registrar().disabled).toBe(true);
    await userEvent.type(campo, "{backspace}");
    expect(campo.value).toBe("3.600,00");
    expect(registrar().disabled).toBe(false);
  });
});
