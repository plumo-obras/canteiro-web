"use client";
/**
 * O pedido dos itens marcados em "Falta comprar": quantidade e preço já vêm do orçamento, e a pessoa só muda o que o
 * fornecedor fez diferente. Entra direto como "Pedido feito" (aprovado); o aviso compara com o orçamento.
 */
import { useId, useRef, useState } from "react";
import type { EtapaObra, Fornecedor, ItemInsumo, Pedido } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { fmtReais, lerQtd, lerReais, qtdParaCampo, reaisParaCampo } from "@/lib/formato";
import { useCasca } from "../contexto";
import { Modal } from "../Dialogo";
import { Campo, ErroApi, useEnvio } from "../formularios/Campos";
import { totalLinha } from "../formularios/ModalNovoPedido";
import s from "./compras.module.css";
import { valorPeloOrcamento } from "./FaltaComprar";

export function ModalPedidoMarcados(props: { obraId: string; marcados: ItemInsumo[]; etapas: EtapaObra[]; fornecedores: Fornecedor[]; pedidos: Pedido[]; fechar: () => void }) {
  const { obraId, marcados, etapas, fornecedores, pedidos } = props;
  const { avisarFeito, mudou } = useCasca();
  const [fornecedor, setFornecedor] = useState("");
  const [previsao, setPrevisao] = useState("");
  const [linhas, setLinhas] = useState(() =>
    marcados.map((i) => ({
      item: i,
      qtd: qtdParaCampo(i.conta.comprar),
      unit: i.insumo.valor_unitario ? reaisParaCampo(i.insumo.valor_unitario) : "",
      etapa: i.insumo.etapa ?? "",
    })),
  );
  const primeiro = useRef<HTMLInputElement>(null);
  const idLista = useId();
  const forn = fornecedores.find((f) => f.nome.trim().toLowerCase() === fornecedor.trim().toLowerCase());
  const usados = [...new Set(pedidos.map((p) => p.fornecedor))].slice(0, 4);

  const mudar = (i: number, p: Partial<(typeof linhas)[number]>) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const lidas = linhas.map((l) => ({ q: lerQtd(l.qtd), v: lerReais(l.unit) }));
  const total = lidas.reduce((t, x) => t + totalLinha(x.q, x.v), 0);
  const orcado = marcados.reduce((t, i) => t + valorPeloOrcamento(i), 0);
  const todosComPreco = marcados.every((i) => i.insumo.valor_unitario > 0);
  const diferenca = total - orcado;

  const erroLinha = (i: number) => {
    const { q, v } = lidas[i]!;
    if (q === null || q === 0) return "Digite a quantidade, ex.: 120 ou 2,5.";
    if (v === null) return "Digite o preço unitário, ex.: 39,90.";
    // A API exige a etapa em obra com orçamento: item antigo, sem etapa, precisa escolher aqui.
    if (etapas.length && !linhas[i]!.etapa) return "Escolha a etapa do orçamento.";
    return null;
  };
  const errosLinhas = linhas.map((_, i) => erroLinha(i));

  const { erros, erroApi, ocupado, enviar } = useEnvio(
    () => ({
      fornecedor: fornecedor.trim() ? null : "Diga de quem é a compra.",
      linhas: errosLinhas.some(Boolean) ? "Corrija as linhas marcadas." : null,
    }),
    async () => {
      const p = await api.criarPedido(obraId, {
        fornecedor: forn?.nome ?? fornecedor.trim(),
        fornecedor_id: forn?.id ?? null,
        previsao: previsao || null,
        observacao: "",
        aprovado: true,
        linhas: linhas.map((l, i) => ({ insumo_id: l.item.insumo.id, quantidade: lidas[i]!.q!, valor_unitario: lidas[i]!.v!, etapa: l.etapa || null })),
      });
      mudou();
      props.fechar();
      avisarFeito(`${p.numero}: pedido feito, ${fmtReais(p.valor)}.`, p.registro_id);
    },
  );
  const mostrarErros = !!erros.linhas;
  const n = marcados.length;

  return (
    <Modal
      titulo={n === 1 ? "Pedido de 1 item" : `Pedido de ${n} itens`}
      fechar={props.fechar}
      focoInicial={primeiro}
      largo
      rodape={
        <>
          <button type="button" className="btn" onClick={props.fechar}>
            Voltar
          </button>
          <button type="submit" form="form-pedido-marcados" className="btn amb" disabled={ocupado} aria-busy={ocupado}>
            Registrar pedido de {fmtReais(total)}
          </button>
        </>
      }
    >
      <form id="form-pedido-marcados" onSubmit={enviar} noValidate>
        <p className="mut" style={{ margin: "0 0 12px" }}>
          Quantidade e preço vêm do orçamento. Mude se o fornecedor fez outro preço.
        </p>
        <div className="campos2">
          <Campo rotulo="Fornecedor" erro={erros.fornecedor}>
            {(a) => <input {...a} ref={primeiro} className="f" list={idLista} autoComplete="off" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} />}
          </Campo>
          <datalist id={idLista}>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.nome} />
            ))}
          </datalist>
          <Campo rotulo="Chega em (opcional)">{(a) => <input {...a} type="date" className="f" value={previsao} onChange={(e) => setPrevisao(e.target.value)} />}</Campo>
        </div>
        {usados.length ? (
          <div className={s.fornecedores} role="group" aria-label="Fornecedores usados nesta obra">
            {usados.map((f) => (
              <button key={f} type="button" className="btn sm" onClick={() => setFornecedor(f)}>
                {f}
              </button>
            ))}
          </div>
        ) : null}

        <ul className={s.linhasPed} aria-label="Itens do pedido">
          <li className={`${s.linhaPed} ${s.cab}`} aria-hidden="true">
            <span>Item</span>
            <span>Quant.</span>
            <span>Preço unit.</span>
            <span className={s.total}>Total</span>
          </li>
          {linhas.map((l, i) => {
            const t = totalLinha(lidas[i]!.q, lidas[i]!.v);
            const erro = mostrarErros ? errosLinhas[i] : null;
            const { nome, unidade } = l.item.insumo;
            return (
              <li key={l.item.insumo.id} className={s.linhaPed}>
                <span className={s.nomePed}>
                  {nome} <span className="mut">{unidade}</span>
                </span>
                <input className="f" inputMode="decimal" autoComplete="off" aria-label={`Quantidade de ${nome}`} value={l.qtd} onChange={(e) => mudar(i, { qtd: e.target.value })} />
                <input className="f" inputMode="decimal" autoComplete="off" placeholder="0,00" aria-label={`Preço de ${nome}`} value={l.unit} onChange={(e) => mudar(i, { unit: e.target.value })} />
                <span className={`num ${s.total}`}>{t ? fmtReais(t) : "—"}</span>
                {etapas.length && !l.item.insumo.etapa ? (
                  <select className={`f ${s.etapaPed}`} aria-label={`Etapa de ${nome}`} value={l.etapa} onChange={(e) => mudar(i, { etapa: e.target.value })}>
                    <option value="">Escolha a etapa…</option>
                    {etapas.map((e) => (
                      <option key={e.etapa} value={e.etapa}>
                        {e.etapa} · {e.descricao}
                      </option>
                    ))}
                  </select>
                ) : null}
                {erro ? (
                  <div className={`campo-erro ${s.erroLinha}`} role="alert">
                    {erro}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>

        <div className={s.resumo}>
          <b>{fmtReais(total)}</b>
          {todosComPreco && diferenca ? <span className={`pill${diferenca > 0 ? " warn" : ""}`}>{fmtReais(Math.abs(diferenca))} {diferenca > 0 ? "acima" : "abaixo"} do orçamento</span> : null}
        </div>
        <p className={`mut sm ${s.nota}`}>O pedido entra como "Pedido feito". Quando o material chegar, um toque em "Chegou". O pagamento se lança em Gastos, com a foto do comprovante.</p>
        <ErroApi texto={erroApi} />
      </form>
    </Modal>
  );
}
