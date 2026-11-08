import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { criarRede, json } from "@/testes/rede";
import { EditorCad } from "./EditorCad";

afterEach(() => vi.unstubAllGlobals());

const props = (espelho = vi.fn(async () => ({ arquivo: new Blob(["0\nSECTION"]), nome: "espelho-obra.dxf" }))) => ({
  espelho,
  aoSalvar: vi.fn(async () => "nenhuma mudança"),
  foco: null,
  visivel: true,
});

describe("EditorCad", () => {
  it("com o CAD instalado, embute o editor no modo hospedeiro", async () => {
    criarRede({ "HEAD /cadcraft/index.html": () => new Response(null, { status: 200 }) });
    render(<EditorCad {...props()} />);
    const quadro = await screen.findByTitle("Editor CAD (CADCraft)");
    expect(quadro).toHaveAttribute("src", "/cadcraft/index.html?host=parent");
  });

  it("sem o CAD neste ambiente, explica e deixa baixar o DXF para editar fora", async () => {
    criarRede({ "HEAD /cadcraft/index.html": () => json({ detail: "não encontrado" }, 404) });
    const espelho = vi.fn(async () => ({ arquivo: new Blob(["0\nSECTION"]), nome: "espelho-obra.dxf" }));
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() }));
    const u = userEvent.setup();
    render(<EditorCad {...props(espelho)} />);
    expect(await screen.findByRole("heading", { name: "O editor CAD não está instalado neste ambiente" })).toBeInTheDocument();
    expect(screen.queryByTitle("Editor CAD (CADCraft)")).not.toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Baixar o modelo em DXF" }));
    expect(espelho).toHaveBeenCalledTimes(1);
  });
});
