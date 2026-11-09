"use client";
/**
 * Ajustar e aprovar numa ação só: a pessoa corrige o que o agente propôs (a quantidade, o fornecedor, o que chegou de
 * fato) e aprova. Não existe "salvar ajuste" sem aprovar: uma proposta mexida e parada esperando seria uma segunda fila
 * de decisões. Só os campos que a API aceita ajustar aparecem; o resto da proposta é do agente.
 */
import { useRef, useState } from "react";
import type { AjustesProposta, DadosAjusteEstoque, DadosAvancarPedido, DadosCriarPedido, Proposta } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { fmtQtdUn, fmtReais, lerQtd, lerReais, qtdParaCampo, reaisParaCampo } from "@/lib/formato";
import { useCasca } from "../contexto";
import { Modal } from "../Dialogo";
import { useCarregar } from "../useCarregar";
import { Campo, ErroApi, useEnvio } from "./Campos";

export function ModalAjustar({ proposta, fechar }: { proposta: Proposta; fechar: () => void }) {
  const titulo = proposta.tipo === "avancar_pedido" ? "Ajustar a conferência" : proposta.tipo === "ajuste_estoque" ? "Ajustar o acerto de estoque" : "Ajustar a compra";
  return (
    <Modal titulo={titulo} fechar={fechar} rodape={<BotoesAjustar fechar={fechar} />}>
      <p className="mut" style={{ margin: 0 }}>
        {proposta.titulo}
      </p>
      {proposta.tipo === "criar_pedido" ? (
        <AjustarCompra p={proposta} fechar={fechar} />
      ) : proposta.tipo === "avancar_pedido" ? (
        <AjustarConferencia p={proposta} fechar={fechar} />
      ) : (
        <AjustarEstoque p={proposta} fechar={fechar} />
      )}
    </Modal>
  );
}

function BotoesAjustar({ fechar }: { fechar: () => void }) {
  return (
    <>
      <button type="button" className="btn" onClick={fechar}>
        Voltar
      </button>
      <button type="submit" form="form-ajustar" className="btn amb">
        Aprovar com o ajuste
      </button>
    </>
  );
}

/** Aprova com só o que mudou: mandar campo igual ao original faria o registro dizer "ajustado" sem ter mudado nada. */
function useAprovarAjustado(p: Proposta, fechar: () => void) {
  const { aprovar, avisar } = useCasca();
  return async (ajustes: AjustesProposta) => {
    const mudou = Object.fromEntries(Object.entries(ajustes).filter(([k, v]) => (p.dados as Record<string, unknown>)[k] !== v));
    await aprovar(p.id, mudou as AjustesProposta);
    fechar();
    avisar(Object.keys(mudou).length ? "Aprovado com o ajuste." : "Aprovado (nada foi mudado).");
  };
}

function useUnidade(obraId: string, insumoId: string | undefined) {
  const { dado } = useCarregar(() => api.listarInsumos(obraId), [obraId]);
  return dado?.find((i) => i.insumo.id === insumoId)?.insumo.unidade ?? "";
}

function AjustarCompra({ p, fechar }: { p: Proposta; fechar: () => void }) {
  const d = p.dados as unknown as DadosCriarPedido;
  const un = useUnidade(p.obra_id, d.insumo_id);
  const [qtd, setQtd] = useState(qtdParaCampo(d.quantidade));
  const [valor, setValor] = useState(reaisParaCampo(d.valor));
  const [fornecedor, setFornecedor] = useState(d.fornecedor);
  const [previsao, setPrevisao] = useState(d.previsao ?? "");
  const campo = useRef<HTMLInputElement>(null);
  const aprovar = useAprovarAjustado(p, fechar);
  const q = lerQtd(qtd);
  const v = lerReais(valor);
  const { erros, erroApi, enviar } = useEnvio(
    () => ({
      qtd: q === null || q === 0 ? "Digite a quantidade, ex.: 30 ou 2,5." : null,
      valor: v === null ? "Digite o valor total, ex.: 1.170 ou 1.170,50." : null,
      fornecedor: fornecedor.trim() ? null : "Diga de quem vai comprar.",
    }),
    () => aprovar({ quantidade: q!, valor: v!, fornecedor: fornecedor.trim(), previsao: previsao.trim() || (d.previsao ?? null) }),
  );
  return (
    <form id="form-ajustar" onSubmit={enviar} noValidate>
      <div className="campos2">
        <Campo rotulo={`Quantidade${un ? ` (${un})` : ""}`} erro={erros.qtd} dica={q !== d.quantidade ? `O mestre de obras propôs ${fmtQtdUn(d.quantidade, un)}.` : undefined}>
          {(a) => <input {...a} ref={campo} className="f" inputMode="decimal" autoComplete="off" value={qtd} onChange={(e) => setQtd(e.target.value)} />}
        </Campo>
        <Campo rotulo="Valor total (R$)" erro={erros.valor} dica={v !== d.valor ? `O mestre de obras propôs ${fmtReais(d.valor)}.` : undefined}>
          {(a) => <input {...a} className="f" inputMode="decimal" autoComplete="off" value={valor} onChange={(e) => setValor(e.target.value)} />}
        </Campo>
      </div>
      <Campo rotulo="Fornecedor" erro={erros.fornecedor}>
        {(a) => <input {...a} className="f" autoComplete="off" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} />}
      </Campo>
      <Campo rotulo="Previsão de chegada (opcional)">
        {(a) => <input {...a} className="f" autoComplete="off" placeholder="Ex.: chega sexta" value={previsao} onChange={(e) => setPrevisao(e.target.value)} />}
      </Campo>
      <ErroApi texto={erroApi} />
    </form>
  );
}

function AjustarConferencia({ p, fechar }: { p: Proposta; fechar: () => void }) {
  const d = p.dados as unknown as DadosAvancarPedido;
  const { dado } = useCarregar(() => Promise.all([api.listarPedidos(p.obra_id, { limite: 500 }), api.listarInsumos(p.obra_id)]), [p.obra_id]);
  const ped = dado?.[0].find((x) => x.id === d.pedido_id);
  // A proposta de conferência do agente é do pedido de uma linha (o pedido com várias linhas recebe pela tela).
  const linha = ped?.linhas[0];
  const un = linha?.unidade ?? "";
  const pedida = linha?.quantidade ?? null;
  const [qtd, setQtd] = useState<string | null>(d.quantidade_recebida != null ? qtdParaCampo(d.quantidade_recebida) : null);
  const [nf, setNf] = useState(d.nf ?? "");
  const aprovar = useAprovarAjustado(p, fechar);
  // Até o pedido carregar o campo fica vazio; depois começa no que foi pedido (o caso comum: chegou tudo).
  const texto = qtd ?? (pedida !== null ? qtdParaCampo(pedida) : "");
  const q = lerQtd(texto);
  const dif = q !== null && pedida !== null ? q - pedida : 0;
  const { erros, erroApi, enviar } = useEnvio(
    () => ({ qtd: q === null || q === 0 ? "Digite quanto chegou, ex.: 36." : null, nf: nf.trim().length > 60 ? "Número da NF muito longo." : null }),
    () => aprovar({ quantidade_recebida: q!, ...(nf.trim() ? { nf: nf.trim() } : {}) }),
  );
  return (
    <form id="form-ajustar" onSubmit={enviar} noValidate>
      <div className="campos2">
        <Campo rotulo={`Quanto chegou${un ? ` (${un})` : ""}`} erro={erros.qtd} dica={pedida !== null ? `Pedido: ${fmtQtdUn(pedida, un)}.` : undefined}>
          {(a) => <input {...a} className="f" inputMode="decimal" autoComplete="off" value={texto} onChange={(e) => setQtd(e.target.value)} />}
        </Campo>
        <Campo rotulo="NF (opcional)" erro={erros.nf}>
          {(a) => <input {...a} className="f" autoComplete="off" value={nf} onChange={(e) => setNf(e.target.value)} />}
        </Campo>
      </div>
      {dif < 0 ? (
        <div className="conf-dif falta" role="status">
          <b>Faltam {fmtQtdUn(-dif, un)}</b> do que foi pedido. Entra só o que chegou, e a diferença volta para a conta de falta.
        </div>
      ) : dif > 0 ? (
        <div className="conf-dif sobra" role="status">
          <b>Chegaram {fmtQtdUn(dif, un)} a mais</b> do que o pedido. Entra tudo o que chegou.
        </div>
      ) : null}
      <ErroApi texto={erroApi} />
    </form>
  );
}

function AjustarEstoque({ p, fechar }: { p: Proposta; fechar: () => void }) {
  const d = p.dados as unknown as DadosAjusteEstoque;
  const un = useUnidade(p.obra_id, d.insumo_id);
  const [qtd, setQtd] = useState(qtdParaCampo(d.quantidade));
  const [motivo, setMotivo] = useState(d.motivo);
  const aprovar = useAprovarAjustado(p, fechar);
  const q = lerQtd(qtd, { negativo: true });
  const { erros, erroApi, enviar } = useEnvio(
    () => ({
      qtd: q === null ? "Digite o ajuste com sinal: 12 soma, -12 tira." : q === 0 ? "Ajuste de zero não muda nada." : null,
      motivo: motivo.trim() ? null : "Diga o motivo do acerto.",
    }),
    () => aprovar({ quantidade: q!, motivo: motivo.trim() }),
  );
  return (
    <form id="form-ajustar" onSubmit={enviar} noValidate>
      <Campo rotulo={`Ajuste${un ? ` (${un})` : ""}`} erro={erros.qtd} dica="Positivo soma ao saldo, negativo tira.">
        {(a) => <input {...a} className="f" inputMode="decimal" autoComplete="off" value={qtd} onChange={(e) => setQtd(e.target.value)} />}
      </Campo>
      <Campo rotulo="Motivo" erro={erros.motivo}>
        {(a) => <input {...a} className="f" autoComplete="off" value={motivo} onChange={(e) => setMotivo(e.target.value)} />}
      </Campo>
      <ErroApi texto={erroApi} />
    </form>
  );
}
