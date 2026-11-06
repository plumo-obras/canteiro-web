/**
 * A ordem do Tab dentro de um diálogo, decidida aqui e não pelo navegador. O Safari (e o WebView do portal), no padrão
 * do macOS, só para no Tab em campo de texto e lista: pula botões, rádios e links. Na revisão do comprovante isso
 * deixava "Confirmar gasto" fora do teclado e, a partir de um botão, o foco escapava para o corpo da página. Com a
 * lista feita aqui, todo navegador para nos mesmos lugares.
 *
 * Grupo de rádios é UMA parada (a opção marcada, ou a primeira se nenhuma está): entre as opções se anda com as
 * setas, como num grupo de rádios nativo. Assim o Tab vai de grupo em grupo e não passa por cada opção da IA.
 */

const CANDIDATOS = 'a[href],button,input,select,textarea,iframe,[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';

function visivel(el: HTMLElement): boolean {
  // Sem layout (jsdom) não dá para medir; hidden, inert e display:none em um ancestral resolvem os casos da casca.
  if (el.closest("[hidden],[inert]")) return false;
  return getComputedStyle(el).visibility !== "hidden";
}

function focavel(el: HTMLElement): boolean {
  if (el.matches(":disabled")) return false;
  if (el.getAttribute("tabindex") === "-1") return false;
  if (el instanceof HTMLInputElement && el.type === "hidden") return false;
  return visivel(el);
}

/** Os elementos que recebem Tab dentro da caixa, na ordem do documento, com cada grupo de rádios reduzido a uma parada. */
export function paradasDoTab(caixa: HTMLElement): HTMLElement[] {
  const todos = [...caixa.querySelectorAll<HTMLElement>(CANDIDATOS)].filter(focavel);
  const grupos = new Map<string, HTMLInputElement[]>();
  for (const el of todos)
    if (el instanceof HTMLInputElement && el.type === "radio" && el.name) {
      const g = grupos.get(el.name) ?? [];
      g.push(el);
      grupos.set(el.name, g);
    }
  return todos.filter((el) => {
    if (!(el instanceof HTMLInputElement) || el.type !== "radio" || !el.name) return true;
    const g = grupos.get(el.name)!;
    return el === (g.find((r) => r.checked) ?? g[0]);
  });
}

/** O próximo (ou o anterior) da lista, dando a volta: o foco nunca sai da caixa. Fora da lista → o primeiro (o último). */
export function proximaParada(paradas: HTMLElement[], atual: Element | null, voltar: boolean): HTMLElement | null {
  if (!paradas.length) return null;
  let i = atual ? paradas.indexOf(atual as HTMLElement) : -1;
  // rádio que não é a parada do grupo (a pessoa clicou em outra opção): vale a posição do grupo
  if (i < 0 && atual instanceof HTMLInputElement && atual.type === "radio" && atual.name)
    i = paradas.findIndex((p) => p instanceof HTMLInputElement && p.type === "radio" && p.name === atual.name);
  if (i < 0) return voltar ? paradas[paradas.length - 1]! : paradas[0]!;
  const n = paradas.length;
  return paradas[(i + (voltar ? -1 : 1) + n) % n]!;
}

/**
 * Setas num rádio: vai para a opção vizinha do mesmo grupo e a marca, dando a volta. O clique faz o React ver a troca
 * (onChange) exatamente como no clique do mouse. Devolve se tratou a tecla.
 */
export function setaNoRadio(e: KeyboardEvent): boolean {
  const el = e.target;
  if (!(el instanceof HTMLInputElement) || el.type !== "radio" || !el.name) return false;
  const frente = e.key === "ArrowDown" || e.key === "ArrowRight";
  const tras = e.key === "ArrowUp" || e.key === "ArrowLeft";
  if (!frente && !tras) return false;
  const raiz = el.form ?? el.ownerDocument;
  const grupo = [...raiz.querySelectorAll<HTMLInputElement>(`input[type=radio]`)].filter((r) => r.name === el.name && focavel(r));
  if (grupo.length < 2) return false;
  const i = grupo.indexOf(el);
  const alvo = grupo[(i + (frente ? 1 : -1) + grupo.length) % grupo.length]!;
  e.preventDefault();
  alvo.focus();
  if (!alvo.checked) alvo.click();
  return true;
}

/** Campos com várias paradas internas (dia, mês e ano): o Tab entre elas é do navegador. */
export const temParadasInternas = (el: Element | null) =>
  el instanceof HTMLInputElement && ["date", "time", "datetime-local", "month", "week"].includes(el.type);
