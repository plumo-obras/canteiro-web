"use client";
/**
 * Aba Suprimentos: o que a obra consome (materiais e serviços), os pedidos aos fornecedores e o cadastro deles, numa
 * tela só. Era Almoxarifado + Pedidos: na obra é uma conversa só ("falta cimento, pede no Areial"). A tela carrega
 * uma vez o que as três seções usam (itens com a Conta, pedidos abertos, etapas do orçamento e fornecedores); a
 * "versão" da casca recarrega tudo depois de cada escrita.
 */
import { useState } from "react";
import type { EtapaObra, Fornecedor, Obra } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { fmtReais } from "@/lib/formato";
import { CabecalhoPagina, type Kpi } from "./CabecalhoPagina";
import { useCasca } from "./contexto";
import { Icone } from "./Icone";
import { useCarregar } from "./useCarregar";
import { ModalMovimento } from "./formularios/ModalMovimento";
import { ModalNovoPedido } from "./formularios/ModalNovoPedido";
import { ListaFornecedores, ModalFornecedor } from "./suprimentos/Fornecedores";
import { Itens, ehServico, situacao, type Lancar } from "./suprimentos/Itens";
import { ModalNovoItem } from "./suprimentos/ModalNovoItem";
import { ABERTOS, QuadroPedidos, valorAReceber } from "./suprimentos/Pedidos";

type Secao = "itens" | "pedidos" | "fornecedores";
const SECOES: { k: Secao; rotulo: string }[] = [
  { k: "itens", rotulo: "Itens" },
  { k: "pedidos", rotulo: "Pedidos" },
  { k: "fornecedores", rotulo: "Fornecedores" },
];

// Etapas e fornecedores são da Fase 2: se a rota ainda não existir (API antiga), a tela segue sem eles.
const ouVazio = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);

export function Suprimentos({ obra, secaoInicial = "itens" }: { obra: Obra; secaoInicial?: Secao }) {
  const { versao, podeOperar } = useCasca();
  const [secao, setSecao] = useState<Secao>(secaoInicial);
  const [lancando, setLancando] = useState<Lancar | null>(null);
  const [modal, setModal] = useState<{ k: "item" } | { k: "fornecedor"; f?: Fornecedor } | null>(null);
  const { dado, erro, carregando } = useCarregar(
    () =>
      Promise.all([
        api.listarInsumos(obra.id),
        api.listarPedidos(obra.id, { status: ABERTOS, limite: 500 }),
        ouVazio<EtapaObra>(api.etapas(obra.id)),
        ouVazio<Fornecedor>(api.listarFornecedores()),
      ]),
    [obra.id, versao],
  );
  const [itens, pedidos, etapas, fornecedores] = dado ?? [[], [], [], []];
  const nFalta = itens.filter((i) => situacao(i.conta) === "falta").length;
  const valorAberto = pedidos.reduce((t, p) => t + valorAReceber(p), 0);
  const parciais = pedidos.filter((p) => p.status === "parcial").length;

  // Só o que existe: "0 itens faltando" engana quando nenhum item tem quantidade prevista.
  const kpis: Kpi[] = [];
  if (dado && nFalta)
    kpis.push({ icone: "alert", n: nFalta, r: nFalta === 1 ? "item faltando para terminar a obra" : "itens faltando para terminar a obra", tag: "comprar", tom: "acima" });
  // Pedido aberto e entrega pela metade são o mesmo pedido: uma linha só ("R$ 910,00 a receber · 1 pedido, entrega pela metade").
  if (dado && pedidos.length) {
    const ped = `${pedidos.length} ${pedidos.length === 1 ? "pedido" : "pedidos"}`;
    const meio = !parciais ? "" : parciais === pedidos.length ? (parciais === 1 ? ", entrega pela metade" : ", entregas pela metade") : `, ${parciais} com entrega pela metade`;
    kpis.push({ icone: "cart", n: fmtReais(valorAberto), r: `a receber · ${ped}${meio}` });
  }

  const acoes = (
    <>
      <div className="seg" role="tablist" aria-label="Seções de Suprimentos">
        {SECOES.map((s) => (
          <button key={s.k} type="button" role="tab" aria-selected={secao === s.k} className={secao === s.k ? "on" : ""} onClick={() => setSecao(s.k)}>
            {s.rotulo}
            {s.k === "pedidos" && pedidos.length ? <small className="seg-n">{pedidos.length}</small> : null}
          </button>
        ))}
      </div>
      {podeOperar && dado ? (
        secao === "itens" ? (
          <>
            {itens.some((i) => !ehServico(i)) ? (
              <button type="button" className="btn amb" onClick={() => setLancando({ tipo: "saida" })}>
                Lançar entrada ou saída
              </button>
            ) : null}
            <button type="button" className="link acao-sec" onClick={() => setModal({ k: "item" })}>
              <Icone nome="plus" tam={14} />
              Novo item
            </button>
          </>
        ) : secao === "pedidos" ? (
          <button type="button" className="btn amb" onClick={() => setLancando({ tipo: "pedido" })}>
            <Icone nome="plus" tam={15} />
            Novo pedido
          </button>
        ) : (
          <button type="button" className="btn amb" onClick={() => setModal({ k: "fornecedor" })}>
            <Icone nome="plus" tam={15} />
            Novo fornecedor
          </button>
        )
      ) : null}
    </>
  );

  return (
    <div className="page">
      <CabecalhoPagina titulo="Suprimentos" kpis={kpis} acoes={acoes} />
      {erro ? (
        <div className="aviso-erro" role="alert">
          <Icone nome="alert" tam={15} />
          {erro}
        </div>
      ) : null}
      {carregando && !dado ? (
        <div className="carregando" role="status">
          <Icone nome="loader" className="spin" tam={15} />
          Carregando suprimentos…
        </div>
      ) : dado ? (
        <div role="tabpanel" aria-label={SECOES.find((s) => s.k === secao)!.rotulo}>
          {secao === "itens" ? (
            <Itens obra={obra} itens={itens} etapas={etapas} lancar={setLancando} lancando={!!lancando} />
          ) : secao === "pedidos" ? (
            <QuadroPedidos obra={obra} pedidos={pedidos} itens={itens} etapas={etapas} fornecedores={fornecedores} />
          ) : (
            <ListaFornecedores fornecedores={fornecedores} editar={podeOperar ? (f) => setModal({ k: "fornecedor", f }) : null} />
          )}
        </div>
      ) : null}

      {lancando?.tipo === "pedido" ? (
        <ModalNovoPedido
          obraId={obra.id}
          itens={itens}
          etapas={etapas}
          fornecedores={fornecedores}
          insumoInicial={lancando.insumoId}
          fechar={() => setLancando(null)}
        />
      ) : lancando ? (
        <ModalMovimento
          obraId={obra.id}
          itens={itens.filter((i) => !ehServico(i))}
          etapas={etapas}
          insumoInicial={lancando.insumoId}
          tipoInicial={lancando.tipo}
          fechar={() => setLancando(null)}
        />
      ) : null}
      {modal?.k === "item" ? <ModalNovoItem obraId={obra.id} fechar={() => setModal(null)} /> : null}
      {modal?.k === "fornecedor" ? <ModalFornecedor fornecedor={modal.f} fechar={() => setModal(null)} /> : null}
    </div>
  );
}
