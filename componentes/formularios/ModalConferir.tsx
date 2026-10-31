"use client";
/**
 * Conferir a chegada: quanto chegou de fato e a NF. Entra no almoxarifado o que chegou, não o que foi pedido; se veio
 * menos, a diferença volta sozinha para a conta de falta (o pedido sai do "a caminho"), e o aviso diz isso antes de
 * gravar para ninguém achar que a falta sumiu.
 */
import { useRef, useState } from "react";
import type { Insumo, Pedido } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { fmtQtdUn, lerQtd, qtdParaCampo } from "@/lib/formato";
import { useCasca } from "../contexto";
import { Modal } from "../Dialogo";
import { Campo, ErroApi, useEnvio } from "./Campos";

export function ModalConferir({ pedido, insumo, fechar }: { pedido: Pedido; insumo: Insumo | undefined; fechar: () => void }) {
  const { avisarFeito, mudou } = useCasca();
  const un = insumo?.unidade ?? "";
  const [qtd, setQtd] = useState(qtdParaCampo(pedido.quantidade));
  const [nf, setNf] = useState(pedido.nf ?? "");
  const campo = useRef<HTMLInputElement>(null);
  const recebida = lerQtd(qtd);
  const dif = recebida === null ? null : recebida - pedido.quantidade;

  const { erros, erroApi, ocupado, enviar } = useEnvio(
    () => ({
      qtd: recebida === null ? "Digite a quantidade que chegou, ex.: 36 ou 36,5." : recebida === 0 ? "Se nada chegou, não confira ainda." : null,
      nf: nf.trim().length > 60 ? "Número da NF muito longo." : null,
    }),
    async () => {
      const r = await api.avancarPedido(pedido.id, "conferido", {
        quantidade_recebida: recebida!,
        ...(nf.trim() ? { nf: nf.trim() } : {}),
      });
      mudou();
      fechar();
      avisarFeito(`${fmtQtdUn(recebida!, un)} entraram no almoxarifado (${pedido.numero}).`, r.registro_id);
    },
  );

  return (
    <Modal
      titulo={`Conferir ${pedido.numero}`}
      fechar={fechar}
      focoInicial={campo}
      rodape={
        <>
          <button type="button" className="btn" onClick={fechar}>
            Voltar
          </button>
          <button type="submit" form="form-conferir" className="btn amb" disabled={ocupado} aria-busy={ocupado}>
            {recebida ? `Dar entrada de ${fmtQtdUn(recebida, un)}` : "Dar entrada"}
          </button>
        </>
      }
    >
      <p className="mut" style={{ margin: 0 }}>
        Pedido de {fmtQtdUn(pedido.quantidade, un)} de {insumo?.nome ?? "insumo"} · {pedido.fornecedor}
      </p>
      <form id="form-conferir" onSubmit={enviar} noValidate>
        <div className="campos2">
          <Campo rotulo={`Quanto chegou${un ? ` (${un})` : ""}`} erro={erros.qtd}>
            {(a) => <input {...a} ref={campo} className="f" inputMode="decimal" autoComplete="off" value={qtd} onChange={(e) => setQtd(e.target.value)} />}
          </Campo>
          <Campo rotulo="NF (opcional)" erro={erros.nf}>
            {(a) => <input {...a} className="f" autoComplete="off" placeholder="Ex.: 4471" value={nf} onChange={(e) => setNf(e.target.value)} />}
          </Campo>
        </div>
        {dif !== null && dif !== 0 && recebida ? (
          <div className={`conf-dif ${dif < 0 ? "falta" : "sobra"}`} role="status">
            {dif < 0 ? (
              <>
                <b>Faltam {fmtQtdUn(-dif, un)}</b> do que foi pedido. Entra só o que chegou, e a diferença volta para a conta de falta do almoxarifado.
              </>
            ) : (
              <>
                <b>Chegaram {fmtQtdUn(dif, un)} a mais</b> do que o pedido. Entra tudo o que chegou.
              </>
            )}
          </div>
        ) : null}
        <ErroApi texto={erroApi} />
      </form>
    </Modal>
  );
}
