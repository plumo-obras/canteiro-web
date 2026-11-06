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

export const MSG = {
  naoComprovante: "Envie uma foto ou um PDF do comprovante.",
  pdfGrande: "PDF maior que 4 MB. Envie só a página do comprovante, ou uma foto dela.",
  pdfCorrompido: "Este PDF não abre: o arquivo parece corrompido. Gere o PDF de novo ou envie uma foto do comprovante.",
  // o .jpg que não abre não está "no formato errado": está estragado (ou nem é foto). Pedir "envie em JPG" confundia.
  corrompida: "Esta foto não abre: o arquivo parece corrompido ou não é uma imagem de verdade. Tire a foto de novo ou escolha outro arquivo.",
  formato: "Esta foto está num formato que não abre neste navegador (HEIC, por exemplo). Tire de novo pela câmera ou envie em JPG ou PNG.",
  grande: "Não consegui deixar a foto abaixo de 3,5 MB. Tire de novo mais perto do comprovante.",
};

type Tipo = "jpeg" | "png" | "webp" | "pdf" | "heic" | "outro";

/** O tipo pelos primeiros bytes (como a API faz), não pela extensão nem pelo tipo que o navegador chuta por ela. */
export async function tipoPelosBytes(f: Blob): Promise<Tipo> {
  const b = new Uint8Array(await f.slice(0, 12).arrayBuffer());
  const txt = (i: number, n: number) => String.fromCharCode(...b.slice(i, i + n));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b[0] === 0x89 && txt(1, 3) === "PNG") return "png";
  if (txt(0, 4) === "RIFF" && txt(8, 4) === "WEBP") return "webp";
  if (txt(0, 5) === "%PDF-") return "pdf";
  if (txt(4, 4) === "ftyp" && /^(heic|heix|hevc|heim|heis|mif1|msf1)$/.test(txt(8, 4))) return "heic";
  return "outro";
}

const pareceImagemComum = (f: File) => /\.(jpe?g|png|webp)$/i.test(f.name) || ["image/jpeg", "image/png", "image/webp"].includes(f.type);

/**
 * Por que a imagem não abriu: corrompida (ou não é imagem) quando os bytes não são de foto ou são de um formato que
 * todo navegador abre; formato quando é HEIC (ou outro que este navegador não lê).
 */
async function motivoSemAbrir(f: File): Promise<string> {
  const t = await tipoPelosBytes(f).catch(() => "outro" as const);
  if (t === "heic") return MSG.formato;
  if (t === "outro") return pareceImagemComum(f) || !f.type.startsWith("image/") ? MSG.corrompida : MSG.formato;
  return MSG.corrompida;
}

const ehPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
const ehImagem = (f: File) => f.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name);

/**
 * Confere o arquivo assim que ele é escolhido, para o aviso aparecer junto do seletor e o "Enviar e ler" nem
 * acender com arquivo que não vai passar. Abre a foto uma vez para saber se ela abre; a redução fica para o envio.
 * Devolve a frase do problema, ou null.
 */
export async function validarArquivo(f: File): Promise<string | null> {
  if (ehPdf(f)) {
    if (f.size > LIMITE_PDF) return MSG.pdfGrande;
    return (await tipoPelosBytes(f).catch(() => "outro")) === "pdf" ? null : MSG.pdfCorrompido;
  }
  if (!ehImagem(f)) return MSG.naoComprovante;
  try {
    (await createImageBitmap(f)).close();
    return null;
  } catch {
    return motivoSemAbrir(f);
  }
}

export async function prepararArquivo(f: File): Promise<{ blob: Blob; nome: string }> {
  if (f.type === "application/pdf") {
    if (f.size > LIMITE_PDF) throw new ArquivoRecusado(MSG.pdfGrande);
    return { blob: f, nome: f.name };
  }
  if (!f.type.startsWith("image/") && !/\.(heic|heif)$/i.test(f.name)) {
    throw new ArquivoRecusado(MSG.naoComprovante);
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(f);
  } catch {
    throw new ArquivoRecusado(await motivoSemAbrir(f));
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
  throw new ArquivoRecusado(MSG.grande);
}
