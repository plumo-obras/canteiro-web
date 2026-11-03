import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// O jsdom não implementa rolagem; a casca rola a aba ativa da barra para a vista ao abrir uma tela.
Element.prototype.scrollIntoView ??= () => {};

afterEach(() => cleanup());
