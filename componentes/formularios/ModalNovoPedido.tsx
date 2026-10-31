"use client";
/**
 * Pedido lançado à mão (o que foi comprado por telefone, no balcão). Escolhido o insumo, a quantidade já vem com o que
 * falta comprar segundo a conta da API: é o número que a pessoa quase sempre ia digitar. Material fora do orçamento
 * (o que a planilha esqueceu) se cadastra aqui mesmo, digitando o nome.
 */
import { useRef, useState } from "react";
import type { ItemInsumo } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { fmtQtdUn, fmtReais, lerQtd, lerReais, qtdParaCampo } from "@/lib/formato";
import { useCasca } from "../contexto";
import { Modal } from "../Dialogo";
import { Campo, ErroApi, useEnvio } from "./Campos";
import { CampoInsumo, CamposInsumoNovo, useInsumoNovo, type EscolhaInsumo } from "./CampoInsumo";

export function ModalNovoPedido({ obraId, itens, insumoInicial, fechar }: { obraId: string; itens: ItemInsumo[]; insumoInicial?: string; fechar: () => void }) {
  const { avisarFeito, mudou } = useCasca();
  const [escolha, setEscolha] = useState<EscolhaInsumo>(insumoInicial ? { tipo: "existente", id: insumoInicial } : null);
  const novo = useInsumoNovo(obraId);
  const insumoId = escolha?.tipo === "existente" ? escolha.id : "";
  const item = itens.find((i) => i.insumo.id === insumoId);
  const [qtd, setQtd] = useState(item && item.conta.comprar > 0 ? qtdParaCampo(item.conta.comprar) : "");
  const [fornecedor, setFornecedor] = useState("");
  const [valor, setValor] = useState("");
  const [previsao, setPrevisao] = useState("");
  const [aprovado, setAprovado] = useState(false);
  const primeiro = useRef<HTMLInputElement>(null);
  const un = item?.insumo.unidade ?? (escolha?.tipo === "novo" ? novo.unidade : "");
  const q = lerQtd(qtd);
  const v = lerReais(valor);

  const escolher = (e: EscolhaInsumo) => {
    setEscolha(e);
    const i = e?.tipo === "existente" ? itens.find((x) => x.insumo.id === e.id) : undefined;
    // Só preenche se o campo ainda não foi mexido: não apaga o que a pessoa digitou ao trocar de insumo.
    if (i && i.conta.comprar > 0 && (!qtd || qtd === qtdParaCampo(item?.conta.comprar ?? -1))) setQtd(qtdParaCampo(i.conta.comprar));
  };

  const { erros, erroApi, ocupado, enviar } = useEnvio(
    () => ({
      insumo: escolha ? null : "Digite o nome do insumo e escolha na lista.",
      unidade: escolha?.tipo === "novo" && !novo.unidade ? "Escolha a unidade." : null,
      qtd: q === null || q === 0 ? "Digite a quantidade, ex.: 120 ou 2,5." : null,
      fornecedor: fornecedor.trim() ? null : "Diga de quem foi comprado.",
      valor: v === null ? "Digite o valor total, ex.: 4.680 ou 4.680,50." : null,
    }),
    async () => {
      const ins = await novo.garantir(escolha, itens);
      const p = await api.criarPedido(obraId, {
        insumo_id: ins.id,
        quantidade: q!,
        fornecedor: fornecedor.trim(),
        valor: v!,
        previsao: previsao.trim() || null,
        aprovado,
      });
      mudou();
      fechar();
      avisarFeito(`${p.numero} criado${aprovado ? " já aprovado" : " em cotação"}.`, p.registro_id);
    },
  );

  return (
    <Modal
      titulo="Novo pedido"
      fechar={fechar}
      focoInicial={primeiro}
      rodape={
        <>
          <button type="button" className="btn" onClick={fechar}>
            Voltar
          </button>
          <button type="submit" form="form-pedido" className="btn amb" disabled={ocupado} aria-busy={ocupado}>
            {aprovado ? `Criar aprovado${v ? ` · ${fmtReais(v)}` : ""}` : "Criar em cotação"}
          </button>
        </>
      }
    >
      <form id="form-pedido" onSubmit={enviar} noValidate>
        <Campo
          rotulo="Insumo"
          erro={erros.insumo}
          dica={
            item
              ? item.conta.comprar > 0
                ? `A conta diz para comprar ${fmtQtdUn(item.conta.comprar, un)}.`
                : "A conta diz que este insumo está coberto."
              : undefined
          }
        >
          {(a) => <CampoInsumo a={a} inputRef={primeiro} itens={itens} valor={escolha} mudar={escolher} permitirNovo />}
        </Campo>
        {escolha?.tipo === "novo" ? <CamposInsumoNovo nome={escolha.nome} novo={novo} erroUnidade={erros.unidade} /> : null}
        <div className="campos2">
          <Campo rotulo={`Quantidade${un ? ` (${un})` : ""}`} erro={erros.qtd}>
            {(a) => <input {...a} className="f" inputMode="decimal" autoComplete="off" value={qtd} onChange={(e) => setQtd(e.target.value)} />}
          </Campo>
          <Campo rotulo="Valor total (R$)" erro={erros.valor}>
            {(a) => (
              <input {...a} className="f" inputMode="decimal" autoComplete="off" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} />
            )}
          </Campo>
        </div>
        <Campo rotulo="Fornecedor" erro={erros.fornecedor}>
          {(a) => <input {...a} className="f" autoComplete="off" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} />}
        </Campo>
        <Campo rotulo="Previsão de chegada (opcional)">
          {(a) => (
            <input {...a} className="f" autoComplete="off" placeholder="Ex.: chega sexta" value={previsao} onChange={(e) => setPrevisao(e.target.value)} />
          )}
        </Campo>
        <label className="check">
          <input type="checkbox" checked={aprovado} onChange={(e) => setAprovado(e.target.checked)} />
          <span>
            Já está aprovado
            <small>O preço está fechado; o pedido pula a cotação e vai direto para enviar ao fornecedor.</small>
          </span>
        </label>
        <ErroApi texto={erroApi} />
      </form>
    </Modal>
  );
}
