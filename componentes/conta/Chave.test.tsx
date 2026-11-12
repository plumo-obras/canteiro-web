import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProvedorCasca } from "../contexto";
import { criarRede, json } from "@/testes/rede";
import { Chave, problemaNaChave } from "./Chave";

vi.mock("@/lib/sessao", () => ({ comAcesso: (u: string, i: RequestInit) => fetch(u, i) }));
afterEach(() => vi.unstubAllGlobals());

const montar = (props: Partial<React.ComponentProps<typeof Chave>> = {}) => {
  const mudou = vi.fn();
  render(
    <ProvedorCasca usuario={null} demo={false}>
      <Chave className="" situacao={null} podeTrocar mudou={mudou} {...props} />
    </ProvedorCasca>,
  );
  return mudou;
};

describe("chave própria da Anthropic", () => {
  it("valida o formato como a API", () => {
    expect(problemaNaChave("")).toMatch(/Cole/);
    expect(problemaNaChave("minha-senha-do-claude-pro")).toMatch(/sk-ant-/);
    expect(problemaNaChave("sk-ant-curta")).toMatch(/curta/);
    expect(problemaNaChave("sk-ant-api03-abcdefghijklmnop")).toBeNull();
  });

  it("admin conecta com campo de senha; depois de enviar o formulário fecha e o campo sai da tela", async () => {
    const rede = criarRede({ "PUT /srv/api/conta/chave-anthropic": () => json({ chave_propria: true, final: "mnop" }) });
    const mudou = montar();
    // estado + botão: o campo só aparece depois de "Conectar chave"
    expect(screen.queryByLabelText("Colar a chave")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Conectar chave" }));
    const campo = screen.getByLabelText("Colar a chave") as HTMLInputElement;
    expect(campo.type).toBe("password");
    expect(document.activeElement).toBe(campo); // o botão sumiu: o foco foi para o campo
    await userEvent.type(campo, "sk-ant-api03-abcdefghijklmnop");
    await userEvent.click(screen.getByRole("button", { name: "Conectar chave" }));
    // o clique só dispara o envio: o "fim" dele é o mudou
    await vi.waitFor(() => expect(mudou).toHaveBeenCalled());
    expect(rede.chamadas.at(-1)!.corpo).toEqual({ chave: "sk-ant-api03-abcdefghijklmnop" });
    expect(campo.isConnected).toBe(false);
    expect(screen.queryByLabelText("Colar a chave")).toBeNull();
  });

  it("ativa mostra só o final; quem só lê não vê o formulário", () => {
    montar({ situacao: { ativa: true, final: "abcd", cadastrada_em: null }, podeTrocar: false });
    expect(screen.getByText("…abcd")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByLabelText(/chave/i, { selector: "input" })).toBeNull();
    expect(screen.getByText(/Só admin ou master/)).toBeTruthy();
  });

  it("mostra quem conectou a chave", () => {
    montar({ situacao: { ativa: true, final: "abcd", cadastrada_em: null, conectada_por: "Marina Duarte" }, podeTrocar: false });
    expect(screen.getByText(/por Marina Duarte/)).toBeTruthy();
  });
});
