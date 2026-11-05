/**
 * Prepara o arquivo do comprovante antes do envio. A API aceita JPG, PNG, WEBP e PDF até 5 MB, e a foto do celular
 * passa disso fácil (ou vem em HEIC, que a leitura não abre). Foto grande ou em outro formato é redesenhada em JPEG,
 * com o lado maior em até 2400 px: legível para a IA e para a pessoa, e bem abaixo do limite.
 */
export const ACEITOS = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
export const LIMITE = 5 * 1024 * 1024;
const ALVO = 4 * 1024 * 1024;
const LADO_MAX = 2400;

export class ArquivoRecusado extends Error {}

export async function prepararArquivo(f: File): Promise<{ blob: Blob; nome: string }> {
  if (f.type === "application/pdf") {
    if (f.size > LIMITE) throw new ArquivoRecusado("PDF maior que 5 MB. Envie só a página do comprovante, ou uma foto dela.");
    return { blob: f, nome: f.name };
  }
  if (ACEITOS.includes(f.type) && f.size <= ALVO) return { blob: f, nome: f.name };
  if (!f.type.startsWith("image/") && !/\.(heic|heif)$/i.test(f.name)) {
    throw new ArquivoRecusado("Envie uma foto ou um PDF do comprovante.");
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(f);
  } catch {
    // o navegador não abre o formato (HEIC no Chrome, por exemplo)
    throw new ArquivoRecusado("Esta foto está num formato que não abre aqui. Tire de novo pela câmera ou envie em JPG.");
  }
  const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const qualidade of [0.85, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", qualidade));
    if (blob && blob.size <= LIMITE) return { blob, nome: f.name.replace(/\.[^.]+$/, "") + ".jpg" };
  }
  throw new ArquivoRecusado("Não consegui deixar a foto abaixo de 5 MB. Tire de novo mais perto do comprovante.");
}
