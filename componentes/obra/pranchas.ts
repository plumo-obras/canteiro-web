/**
 * As pranchas escolhidas na Nova obra: a obra ainda não existe quando a pessoa as arrasta, então o arquivo fica na
 * memória da página e sobe para o tradutor logo depois do cadastro. O pacote de folhas de cada obra mora neste
 * navegador, na MESMA chave e formato que a tela Projeto lê (componentes/Projeto.tsx: lerFolhas/gravarFolhas) — se um
 * mudar, o outro tem de mudar junto.
 */
import { tradutor } from "@/lib/tradutor";

export interface Folha {
  id: string;
  nome: string;
}

/** O limite do repasse (função da Vercel, ~4,5 MB de corpo), o mesmo da tela Projeto. */
export const LIMITE_PRANCHA = 4 * 1024 * 1024;
export const ACEITA_PRANCHAS = ".pdf,.dxf,image/*";

const chave = (obraId: string) => `canteiro:projeto:${obraId}:folhas`;

function gravarFolhas(obraId: string, f: Folha[]) {
  try {
    localStorage.setItem(chave(obraId), JSON.stringify(f));
  } catch {
    // navegador sem armazenamento: a pessoa manda de novo na tela Projeto
  }
}

/** Separa o que passa do limite antes de criar a obra: melhor avisar na hora do que perder o arquivo depois. */
export function grandesDemais(arquivos: File[]): File[] {
  return arquivos.filter((a) => a.size > LIMITE_PRANCHA);
}

/**
 * Envia as pranchas da obra recém-criada e grava o pacote para a tela Projeto. Devolve os nomes que não subiram: a obra
 * já existe, então falhar aqui não desfaz nada — a pessoa só manda de novo na tela Projeto.
 */
export async function enviarPranchas(obraId: string, arquivos: File[]): Promise<string[]> {
  const folhas: Folha[] = [];
  const falhas: string[] = [];
  for (const a of arquivos) {
    try {
      const r = await tradutor.enviar(a);
      folhas.push({ id: r.id, nome: a.name });
    } catch {
      falhas.push(a.name);
    }
  }
  if (folhas.length) gravarFolhas(obraId, folhas);
  return falhas;
}
