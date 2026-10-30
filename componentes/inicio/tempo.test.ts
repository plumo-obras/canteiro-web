import { describe, expect, it } from "vitest";
import { haQuanto, primeiroNome } from "./tempo";

describe("haQuanto", () => {
  const agora = new Date("2026-10-30T15:00:00-03:00");
  it("minutos, horas e dias pelo calendário", () => {
    expect(haQuanto("2026-10-30T14:59:30-03:00", agora)).toBe("agora há pouco");
    expect(haQuanto("2026-10-30T14:20:00-03:00", agora)).toBe("há 40 min");
    expect(haQuanto("2026-10-30T09:00:00-03:00", agora)).toBe("há 6 h");
    expect(haQuanto("2026-10-29T22:00:00-03:00", agora)).toBe("ontem");
    expect(haQuanto("2026-10-26T10:00:00-03:00", agora)).toBe("há 4 dias");
    expect(haQuanto("2026-09-12T10:00:00-03:00", agora)).toBe("em 12/09");
  });
});

describe("primeiroNome", () => {
  it("tira o papel entre parênteses e o sobrenome", () => {
    expect(primeiroNome("Paula (leitura)")).toBe("Paula");
    expect(primeiroNome("Marina Duarte")).toBe("Marina");
    expect(primeiroNome("Rizzi")).toBe("Rizzi");
  });
});
