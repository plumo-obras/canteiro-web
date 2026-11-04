import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// O jsdom não implementa rolagem; a casca rola a aba ativa da barra para a vista ao abrir uma tela. Os testes das rotas
// /srv/* rodam no ambiente node (o mesmo Request/Response/stream do servidor), onde não há DOM para remendar.
if (typeof Element !== "undefined") Element.prototype.scrollIntoView ??= () => {};

afterEach(() => cleanup());
