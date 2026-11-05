/**
 * Prepara o arquivo do comprovante antes do envio. As fotos ficam no próprio banco, que no plano gratuito tem 512 MB
 * para tudo, e vão para o modelo, que recusa imagem acima de 5 MB (em base64) ou com lado acima de 8000 px. A Vercel
 * recusa corpo acima de 4,5 MB. Por isso: foto acima de ~1 MB, com lado acima de 2000 px ou em outro formato (HEIC) é
 * redesenhada em JPEG; continua legível para a IA e para a pessoa. Os limites batem com os da API (docs/contrato.md).
 */
export const ACEITOS = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
export const LIMITE_PDF = 4 * 1024 * 1024;
export const LIMITE_FOTO = 3_500_000;
const ALVO = 1024 * 1024;
const LADO_MAX = 2000;

export class ArquivoRecusado extends Error {}

export async function prepararArquivo(f: File): Promise<{ blob: Blob; nome: string }> {
  if (f.type === "application/pdf") {
    if (f.size > LIMITE_PDF) throw new ArquivoRecusado("PDF maior que 4 MB. Envie só a página do comprovante, ou uma foto dela.");
    return { blob: f, nome: f.name };
  }
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
  const lado = Math.max(bitmap.width, bitmap.height);
  // print comprido de Pix é leve, mas passa do lado que o modelo aceita: as medidas também decidem
  if (ACEITOS.includes(f.type) && f.size <= ALVO && lado <= LADO_MAX) {
    bitmap.close();
    return { blob: f, nome: f.name };
  }
  const escala = Math.min(1, LADO_MAX / lado);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const nome = f.name.replace(/\.[^.]+$/, "") + ".jpg";
  let menor: Blob | null = null;
  for (const qualidade of [0.82, 0.7, 0.6, 0.5]) {
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", qualidade));
    if (!blob) continue;
    if (blob.size <= ALVO) return { blob, nome };
    if (!menor || blob.size < menor.size) menor = blob;
  }
  // foto com muito detalhe não chega a 1 MB: vale a menor, se couber no limite
  if (menor && menor.size <= LIMITE_FOTO) return { blob: menor, nome };
  throw new ArquivoRecusado("Não consegui deixar a foto abaixo de 3,5 MB. Tire de novo mais perto do comprovante.");
}
