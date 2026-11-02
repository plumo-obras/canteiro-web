import { describe, expect, it } from "vitest";
import { centavosCsv, gerarCsv } from "./csv";

describe("CSV para o Excel", () => {
  it("BOM, ponto e vírgula, decimal com vírgula e aspas quando precisa", () => {
    expect(centavosCsv(203500158)).toBe("2035001,58");
    expect(centavosCsv(-5)).toBe("-0,05");
    const t = gerarCsv([["Etapa", "Descrição"], ["3", 'FUNDAÇÕES; "rasas"'], ["4", 1]]);
    expect(t.startsWith("﻿")).toBe(true);
    expect(t).toBe('﻿Etapa;Descrição\r\n3;"FUNDAÇÕES; ""rasas"""\r\n4;1\r\n');
  });
});
