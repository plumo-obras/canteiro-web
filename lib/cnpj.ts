/** CNPJ: a tela guarda só os dígitos (como a API) e mostra 00.000.000/0000-00. */

export const digitosCnpj = (t: string) => t.replace(/\D/g, "").slice(0, 14);

/** Máscara enquanto digita; colar com ou sem pontuação dá no mesmo. */
export function mascararCnpj(t: string): string {
  const d = digitosCnpj(t);
  const p = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 8), d.slice(8, 12), d.slice(12, 14)];
  let s = p[0]!;
  if (d.length > 2) s += `.${p[1]}`;
  if (d.length > 5) s += `.${p[2]}`;
  if (d.length > 8) s += `/${p[3]}`;
  if (d.length > 12) s += `-${p[4]}`;
  return s;
}

/** Dígitos verificadores do CNPJ. A API confere também; aqui é para avisar antes de enviar. */
export function cnpjValido(t: string): boolean {
  const d = digitosCnpj(t);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const dv = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = [...base].reduce((s, c, i) => s + Number(c) * pesos[i]!, 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(d.slice(0, 12));
  return d1 === Number(d[12]) && dv(d.slice(0, 12) + d1) === Number(d[13]);
}
