import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProvedorCasca } from "../contexto";
import { Senha, problemaNaSenha } from "./Senha";

const trocarSenha = vi.hoisted(() => vi.fn());
vi.mock("@/lib/sessao", () => ({ trocarSenha, comAcesso: (u: string, i: RequestInit) => fetch(u, i) }));

beforeEach(() => trocarSenha.mockReset());
afterEach(() => vi.unstubAllGlobals());

function montar() {
  render(
    <ProvedorCasca usuario={null} demo={false}>
      <Senha className="" email="eu@obra.com" />
    </ProvedorCasca>,
  );
}

const abrir = () => userEvent.click(screen.getByRole("button", { name: "Trocar senha" }));
const enviar = () => screen.getByRole("button", { name: "Trocar senha" }) as HTMLButtonElement;
const atual = () => screen.getByLabelText("Senha atual") as HTMLInputElement;
const nova = () => screen.getByLabelText("Nova senha") as HTMLInputElement;
const confirmar = () => screen.getByLabelText("Confirmar a nova senha") as HTMLInputElement;

async function preencher(a: string, n: string, c = n) {
  if (a) await userEvent.type(atual(), a);
  if (n) await userEvent.type(nova(), n);
  if (c) await userEvent.type(confirmar(), c);
}

describe("trocar a própria senha", () => {
  it("ao abrir, o foco vai para a senha atual", async () => {
    montar();
    await abrir();
    expect(document.activeElement).toBe(atual());
  });

  it("regras locais: senha atual, mínimo de 8 e confirmação igual", () => {
    expect(problemaNaSenha("", "nova-senha", "nova-senha")).toMatch(/atual/);
    expect(problemaNaSenha("a", "curta", "curta")).toMatch(/8/);
    expect(problemaNaSenha("a", "x".repeat(257), "x".repeat(257))).toMatch(/256/);
    expect(problemaNaSenha("a", "nova-senha", "nova-senhA")).toMatch(/confirmação/);
    expect(problemaNaSenha("a", "nova-senha", "nova-senha")).toBeNull();
  });

  it("estado + botão; o formulário só aparece ao clicar, com campos de senha", async () => {
    montar();
    expect(screen.queryByLabelText("Senha atual")).toBeNull();
    await abrir();
    expect(atual().type).toBe("password");
    expect(atual().autocomplete).toBe("current-password");
    expect(nova().autocomplete).toBe("new-password");
    expect(confirmar().type).toBe("password");
  });

  it("botão desabilitado enquanto inválido; avisa curta e confirmação diferente", async () => {
    montar();
    await abrir();
    expect(enviar().disabled).toBe(true);
    await preencher("velha", "curta", "");
    expect(screen.getByText("Pelo menos 8 caracteres.")).toBeTruthy();
    expect(enviar().disabled).toBe(true);
    await userEvent.type(nova(), "-agora");
    await userEvent.type(confirmar(), "outra-coisa");
    expect(screen.getByText("A confirmação não confere com a nova senha.")).toBeTruthy();
    expect(enviar().disabled).toBe(true);
    await userEvent.clear(confirmar());
    await userEvent.type(confirmar(), "curta-agora");
    expect(enviar().disabled).toBe(false);
    expect(trocarSenha).not.toHaveBeenCalled();
  });

  it("mostrar/esconder vale para os três campos", async () => {
    montar();
    await abrir();
    await userEvent.click(screen.getByRole("button", { name: "Mostrar as senhas" }));
    expect([atual(), nova(), confirmar()].map((c) => c.type)).toEqual(["text", "text", "text"]);
    await userEvent.click(screen.getByRole("button", { name: "Esconder as senhas" }));
    expect([atual(), nova(), confirmar()].map((c) => c.type)).toEqual(["password", "password", "password"]);
  });

  it("sucesso: chama a troca, fecha, limpa e avisa que os outros aparelhos saíram", async () => {
    trocarSenha.mockResolvedValue({ ok: true });
    montar();
    await abrir();
    await preencher("velha-123", "nova-senha-456");
    await userEvent.click(enviar());
    expect(trocarSenha).toHaveBeenCalledWith("velha-123", "nova-senha-456");
    expect(await screen.findByText("Senha trocada. Os outros aparelhos foram desconectados.")).toBeTruthy();
    expect(screen.queryByLabelText("Senha atual")).toBeNull();
    // reabrir não traz nada do que foi digitado
    await abrir();
    expect(atual().value + nova().value + confirmar().value).toBe("");
  });

  it("erro da API aparece no formulário, que continua aberto e preenchido; ocupado trava o botão", async () => {
    let soltar: (v: unknown) => void = () => undefined;
    trocarSenha.mockReturnValue(new Promise((ok) => (soltar = ok)));
    montar();
    await abrir();
    await preencher("errada", "nova-senha-456");
    await userEvent.click(enviar());
    expect(enviar().disabled).toBe(true);
    expect(enviar().getAttribute("aria-busy")).toBe("true");
    soltar({ ok: false, mensagem: "Senha atual incorreta." });
    expect((await screen.findByRole("alert")).textContent).toBe("Senha atual incorreta.");
    expect(nova().value).toBe("nova-senha-456");
    // digitar de novo apaga o erro velho
    await userEvent.type(atual(), "x");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("cancelar fecha e esquece o que foi digitado", async () => {
    montar();
    await abrir();
    await preencher("velha-123", "nova-senha-456");
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByLabelText("Senha atual")).toBeNull();
    await abrir();
    expect(atual().value).toBe("");
  });
});
