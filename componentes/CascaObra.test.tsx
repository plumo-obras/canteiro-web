import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import type { Obra } from "@/lib/contrato";
import { limparSessao } from "@/lib/sessao";
import { criarRede, json, renovarOk } from "@/testes/rede";
import { Casca } from "./Casca";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

const obra = (id: string, nome: string): Obra =>
  ({ id, tenant_id: "t-1", criado_em: "", nome, cidade: "", cep: "", status: "em_andamento" }) as unknown as Obra;
const OBRAS = [obra("o-casa", "Casa Vila Nova"), obra("o-emei", "EMEI Santa Clara do Sul")];

beforeEach(() => {
  criarRede({
    "POST /srv/auth/renovar": renovarOk,
    "GET /srv/api/obras": () => json(OBRAS),
    "GET /srv/api/sessoes": () => json([]),
    "GET /srv/api/propostas": () => json([]),
  });
});
afterEach(() => {
  limparSessao();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

describe("a obra aberta sobrevive ao recarregar", () => {
  it("a obra da URL abre e continua na URL", async () => {
    window.history.replaceState(null, "", "/?obra=o-emei&tela=orcamento");
    render(<Casca demo={false} />);
    await waitFor(() => expect(localStorage.getItem("plumo.obra")).toBe("o-emei"));
    expect(window.location.search).toBe("?obra=o-emei&tela=orcamento");
  });

  it("sem obra na URL, volta na última aberta neste navegador, não na 1ª da lista", async () => {
    localStorage.setItem("plumo.obra", "o-emei");
    render(<Casca demo={false} />);
    await waitFor(() => expect(window.location.search).toBe("?obra=o-emei"));
    expect(document.body.textContent).toContain("EMEI Santa Clara do Sul");
  });

  it("obra lembrada que não existe mais cai na 1ª em andamento", async () => {
    localStorage.setItem("plumo.obra", "o-apagada");
    render(<Casca demo={false} />);
    await waitFor(() => expect(window.location.search).toBe("?obra=o-casa"));
  });

  it("a conversa aberta também fica na URL: recarregar não volta em 'Nova conversa'", async () => {
    criarRede({
      "POST /srv/auth/renovar": renovarOk,
      "GET /srv/api/obras": () => json(OBRAS),
      "GET /srv/api/sessoes": () =>
        json([{ id: "s-1", tenant_id: "t-1", dono: "u-1", obra_id: "o-emei", titulo: "como tá o aço?", abas: [], total_mensagens: 2, criado_em: "", atualizado_em: "" }]),
      "GET /srv/api/sessoes/s-1/mensagens": () =>
        json([
          { id: "m1", sessao_id: "s-1", seq: 1, papel: "user", conteudo: "como tá o aço?", criado_em: "" },
          { id: "m2", sessao_id: "s-1", seq: 2, papel: "assistant", conteudo: [{ type: "text", text: "Chegou todo." }], criado_em: "" },
        ]),
      "GET /srv/api/propostas": () => json([]),
    });
    window.history.replaceState(null, "", "/?obra=o-emei&sessao=s-1");
    render(<Casca demo={false} />);
    await waitFor(() => expect(document.body.textContent).toContain("Chegou todo."));
    expect(document.querySelector(".conversa-t")?.textContent).toBe("como tá o aço?");
    expect(window.location.search).toBe("?obra=o-emei&sessao=s-1");
  });

  it("conversa nova e vazia não vai para a URL (ainda não existe no servidor)", async () => {
    window.history.replaceState(null, "", "/?obra=o-emei");
    render(<Casca demo={false} />);
    await waitFor(() => expect(document.querySelector(".conversa-t")?.textContent).toBe("Nova conversa"));
    expect(window.location.search).toBe("?obra=o-emei");
  });
});
