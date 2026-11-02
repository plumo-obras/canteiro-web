import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Obra, Usuario } from "@/lib/contrato";
import { ProvedorCasca } from "../contexto";
import { ModalDadosObra } from "./ModalDadosObra";

const obra = {
  id: "o1", tenant_id: "t", criado_em: "", nome: "EMEI Santa Clara", cidade: "Santa Clara do Sul", cep: "95915-000", uf: "RS", endereco: "",
  verba: 203_500_159, status: "em_andamento", tipologia: "outro", area_construida: 1_317_990, pavimentos: 1, padrao: "normal", regime: "empreitada",
  cliente: "", inicio: null, prazo_meses: 11, numero_contrato: "061/2019", bdi: 2291, data_base: "2017-01",
} as Obra;
const leitor: Usuario = { id: "u", nome: "Lia", tenant_id: "t", papel: "viewer" };

describe("Dados desta obra", () => {
  it("só leitura: mostra os dados, campos travados, sem Salvar", () => {
    render(
      <ProvedorCasca usuario={leitor} demo={false}>
        <ModalDadosObra obra={obra} fechar={() => undefined} leitura />
      </ProvedorCasca>,
    );
    const nome = screen.getByLabelText("Nome da obra") as HTMLInputElement;
    expect(nome.value).toBe("EMEI Santa Clara");
    expect(nome).toBeDisabled(); // pelo fieldset disabled, que trava tudo de uma vez
    expect((screen.getByLabelText("Nº do contrato (opcional)") as HTMLInputElement).value).toBe("061/2019");
    expect(screen.getByLabelText("BDI (%)")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Salvar" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Fechar" }).length).toBeGreaterThan(0); // o X e o do rodapé
  });

  it("quem opera continua editando", () => {
    render(
      <ProvedorCasca usuario={{ ...leitor, papel: "admin" }} demo={false}>
        <ModalDadosObra obra={obra} fechar={() => undefined} />
      </ProvedorCasca>,
    );
    expect(screen.getByLabelText("Nome da obra")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Salvar" })).toBeTruthy();
  });
});
