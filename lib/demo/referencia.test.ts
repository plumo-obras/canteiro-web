import { describe, expect, it } from "vitest";
import { lerPlanilhaDemo, referenciaDoTopo } from "./orcamento";

describe("referência do topo na demo, como na API", () => {
  it("lê banco e data-base das linhas que falam de referência", () => {
    expect(
      referenciaDoTopo(["IFB", "Sinapi não desonerado - Data referência técnica: 18/05/2023", "LOCAL : Avenida Monjolo, Chácara 22"]),
    ).toEqual({ data_base: "2023-05", banco: "SINAPI não desonerado" });
    expect(referenciaDoTopo(["SICRO desonerado", "Mês de referência: março/2024"])).toEqual({ data_base: "2024-03", banco: "SICRO desonerado" });
    expect(referenciaDoTopo(["Outros 12", "Rua das Flores 05/2023"])).toEqual({ data_base: null, banco: null });
  });

  it("a leitura da planilha traz os dois", () => {
    const csv = "IFB\nSinapi não desonerado - Data referência técnica: 18/05/2023\n\nITEM;DESCRIÇÃO;UNIDADE;QUANT.;PREÇO TOTAL (R$)\n1.1;Mestre;H;10;100\n";
    const l = lerPlanilhaDemo(csv, "s.csv");
    expect([l.data_base, l.banco]).toEqual(["2023-05", "SINAPI não desonerado"]);
  });
});
