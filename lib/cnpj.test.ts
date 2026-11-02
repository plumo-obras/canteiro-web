import { describe, expect, it } from "vitest";
import { cnpjValido, digitosCnpj, mascararCnpj } from "./cnpj";

describe("CNPJ", () => {
  it("máscara enquanto digita e ao colar", () => {
    expect(mascararCnpj("11")).toBe("11");
    expect(mascararCnpj("11222")).toBe("11.222");
    expect(mascararCnpj("11222333")).toBe("11.222.333");
    expect(mascararCnpj("112223330001")).toBe("11.222.333/0001");
    expect(mascararCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(mascararCnpj("11.222.333/0001-81 extra 99")).toBe("11.222.333/0001-81");
    expect(digitosCnpj("11.222.333/0001-81")).toBe("11222333000181");
  });
  it("confere os dígitos verificadores", () => {
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("11.222.333/0001-82")).toBe(false);
    expect(cnpjValido("11111111111111")).toBe(false);
    expect(cnpjValido("1122233300018")).toBe(false);
  });
});
