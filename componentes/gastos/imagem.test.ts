import { afterEach, describe, expect, it, vi } from "vitest";
import { ArquivoRecusado, LIMITE_FOTO, LIMITE_PDF, prepararArquivo } from "./imagem";

const arquivo = (tamanho: number, tipo: string, nome = "foto.jpg") => {
  const f = new File([new Uint8Array(1)], nome, { type: tipo });
  Object.defineProperty(f, "size", { value: tamanho });
  return f;
};

/** createImageBitmap e o canvas não existem no jsdom: medidas e o JPEG gerado (por qualidade) vêm daqui. */
function simular(medidas: { width: number; height: number } | null, jpegPorQualidade: (q: number) => number = () => 500_000) {
  const desenhos: { w: number; h: number }[] = [];
  vi.stubGlobal("createImageBitmap", medidas ? vi.fn(async () => ({ ...medidas, close: () => {} })) : vi.fn(async () => Promise.reject(new Error("formato"))));
  const criar = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag !== "canvas") return criar(tag);
    const c = { width: 0, height: 0, getContext: () => ({ drawImage: () => desenhos.push({ w: c.width, h: c.height }) }),
      toBlob: (ok: (b: Blob) => void, _t: string, q: number) => {
        const b = new Blob([new Uint8Array(1)], { type: "image/jpeg" });
        Object.defineProperty(b, "size", { value: jpegPorQualidade(q) });
        ok(b);
      } };
    return c as unknown as HTMLCanvasElement;
  });
  return desenhos;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("prepararArquivo", () => {
  it("PDF passa como veio até 4 MB, e acima disso é recusado com dica", async () => {
    const ok = arquivo(LIMITE_PDF, "application/pdf", "nota.pdf");
    expect((await prepararArquivo(ok)).blob).toBe(ok);
    await expect(prepararArquivo(arquivo(LIMITE_PDF + 1, "application/pdf", "nota.pdf"))).rejects.toThrow("4 MB");
  });

  it("foto leve e pequena vai como veio", async () => {
    simular({ width: 1200, height: 1600 });
    const f = arquivo(800_000, "image/jpeg");
    expect((await prepararArquivo(f)).blob).toBe(f);
  });

  it("foto pesada é reduzida a ~1 MB, com o lado maior em 2000 px", async () => {
    const desenhos = simular({ width: 4000, height: 3000 }, () => 700_000);
    const r = await prepararArquivo(arquivo(4_500_000, "image/jpeg"));
    expect(r.nome).toBe("foto.jpg");
    expect(desenhos).toEqual([{ w: 2000, h: 1500 }]);
  });

  it("print comprido e leve também é redesenhado (o modelo recusa lado acima de 8000 px)", async () => {
    const desenhos = simular({ width: 1080, height: 9000 });
    await prepararArquivo(arquivo(300_000, "image/png", "pix.png"));
    expect(desenhos[0]!.h).toBe(2000);
  });

  it("vale a menor qualidade que coube no limite; se nem ela coube, recusa", async () => {
    simular({ width: 2000, height: 2000 }, (q) => (q >= 0.6 ? 2_000_000 : 1_500_000));
    expect((await prepararArquivo(arquivo(5_000_000, "image/jpeg"))).blob.size).toBe(1_500_000);
    simular({ width: 2000, height: 2000 }, () => LIMITE_FOTO + 1);
    await expect(prepararArquivo(arquivo(9_000_000, "image/jpeg"))).rejects.toBeInstanceOf(ArquivoRecusado);
  });

  it("formato que o navegador não abre (HEIC no Chrome) e o que não é foto", async () => {
    simular(null);
    await expect(prepararArquivo(arquivo(2_000_000, "image/heic", "IMG_1.heic"))).rejects.toThrow("formato");
    await expect(prepararArquivo(arquivo(10, "text/plain", "a.txt"))).rejects.toThrow("foto ou um PDF");
  });
});
