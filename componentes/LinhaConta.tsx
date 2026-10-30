import type { Conta } from "@/lib/contrato";
import { fmtQtdUn } from "@/lib/formato";

/**
 * Linha de conta (recibo): precisa − saldo − a caminho [− em cotação] [− transferência] = falta → comprar.
 * Idêntica em tabela, painel e cartão. Só mostra a Conta que veio da API; nenhuma conta é refeita aqui.
 */
export function LinhaConta({ conta, un }: { conta: Conta; un: string }) {
  const n = (v: number) => fmtQtdUn(v, un);
  const termo = (rot: string, v: number) => (
    <span className="lc-t">
      <small>{rot}</small>
      {n(v)}
    </span>
  );
  const op = (s: string) => (
    <span className="lc-op" aria-hidden="true">
      {s}
    </span>
  );
  return (
    <div className="lc">
      <div className="lc-eq">
        {termo("precisa", conta.precisa)}
        {op("−")}
        {termo("saldo", conta.saldo)}
        {op("−")}
        {termo("a caminho", conta.a_caminho)}
        {conta.cotando ? (
          <>
            {op("−")}
            {termo("em cotação", conta.cotando)}
          </>
        ) : null}
        {conta.transferencia ? (
          <>
            {op("−")}
            {termo("transferência", conta.transferencia)}
          </>
        ) : null}
        {op("=")}
        <span className={`lc-t lc-falta ${conta.falta > 0 ? "t-perda" : "t-ok"}`}>
          <small>falta</small>
          {n(conta.falta)}
        </span>
        {op("→")}
        <span className="lc-t lc-comprar">
          <small>comprar</small>
          {n(conta.comprar)}
        </span>
      </div>
    </div>
  );
}
