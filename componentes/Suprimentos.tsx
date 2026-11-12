"use client";
/**
 * Compras: marcar o que falta comprar do orçamento, fazer o pedido e dizer quando chegou. Três abas internas: Comprar
 * (o trabalho do dia: o que falta ao lado dos pedidos), Estoque (entradas, saídas, contagem) e Fornecedores. A tela
 * carrega uma vez o que as seções usam, e a "versão" da casca recarrega tudo depois de cada escrita.
 */
import { useEffect, useRef, useState } from "react";
import type { EtapaObra, Fornecedor, ItemInsumo, Obra } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { uuid7 } from "@/lib/ids";
import { CabecalhoPagina } from "./CabecalhoPagina";
import { useCasca } from "./contexto";
import { Icone } from "./Icone";
import { ProximoPasso } from "./ProximoPasso";
import { useCarregar } from "./useCarregar";
import { ModalMovimento } from "./formularios/ModalMovimento";
import { ModalNovoPedido } from "./formularios/ModalNovoPedido";
import { FaltaComprar } from "./suprimentos/FaltaComprar";
import { ListaFornecedores, ModalFornecedor } from "./suprimentos/Fornecedores";
import { Itens, ehServico, type Lancar } from "./suprimentos/Itens";
import { ModalNovoItem } from "./suprimentos/ModalNovoItem";
import { ModalPedidoMarcados } from "./suprimentos/ModalPedidoMarcados";
import { ABERTOS, ListaPedidos } from "./suprimentos/Pedidos";
import { BaseOrcamento } from "./cronograma/BaseOrcamento";
import { BotaoPlumo } from "./BotaoPlumo";
import s from "./suprimentos/compras.module.css";

type Secao = "compras" | "estoque" | "fornecedores";

// Etapas e fornecedores são da Fase 2: se a rota ainda não existir (API antiga), a tela segue sem eles.
const ouVazio = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);

export function Suprimentos({ obra }: { obra: Obra }) {
  const { versao, podeOperar } = useCasca();
  const [secao, setSecao] = useState<Secao>("compras");
  const [lancando, setLancando] = useState<Lancar | null>(null);
  const [marcados, setMarcados] = useState<ItemInsumo[] | null>(null);
  // Sobe a cada pedido criado: as marcações só saem aí, e "Voltar" no pedido não perde nada.
  const [pedidosFeitos, setPedidosFeitos] = useState(0);
  const desfazendo = obra.status === "desfazendo_aprovacao";
  const { lerFiltroTela, limparFiltroTela } = useCasca();
  const [etapaRecorte, setEtapaRecorte] = useState(() => lerFiltroTela("suprimentos")?.etapa ?? null);
  useEffect(limparFiltroTela, [limparFiltroTela]);
  // Aqui, e não no diálogo: fechar e reabrir depois de uma resposta perdida tem de repetir a mesma chave.
  const chavePedido = useRef(uuid7());
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

  const nFalta = itens.filter((i) => i.conta.comprar > 0).length;
  const acao =
    podeOperar && dado ? (
      secao === "compras" ? (
        desfazendo ? null : (
          <button type="button" className="btn" onClick={() => setLancando({ tipo: "pedido" })}>
            <Icone nome="plus" tam={15} />
            Item fora do orçamento
          </button>
        )
      ) : secao === "fornecedores" ? (
        <button type="button" className="btn amb" onClick={() => setModal({ k: "fornecedor" })}>
          <Icone nome="plus" tam={15} />
          Novo fornecedor
        </button>
      ) : itens.some((i) => !ehServico(i)) ? (
        <button type="button" className="btn amb" onClick={() => setLancando({ tipo: "saida" })}>
          Lançar entrada ou saída
        </button>
      ) : null
    ) : null;
  const menu = secao === "estoque" && podeOperar && dado ? [{ rotulo: "Novo item", acao: () => setModal({ k: "item" }) }] : [];
  const SECOES: { k: Secao; rotulo: string; n?: number }[] = [
    { k: "compras", rotulo: "Comprar", n: nFalta },
    { k: "estoque", rotulo: "Estoque" },
    { k: "fornecedores", rotulo: "Fornecedores" },
  ];
  const abas = (
    <div className="seg" role="tablist" aria-label="Seções de Compras">
      {SECOES.map((x) => (
        <button
          key={x.k}
          type="button"
          role="tab"
          aria-selected={secao === x.k}
          aria-label={x.n ? `${x.rotulo} (${x.n})` : x.rotulo}
          className={secao === x.k ? "on" : ""}
          onClick={() => setSecao(x.k)}
        >
          {x.rotulo}
          {x.n ? <small className="seg-n">{x.n.toLocaleString("pt-BR")}</small> : null}
        </button>
      ))}
    </div>
  );

  return (
    <div className="page">
      <CabecalhoPagina
        titulo="Compras"
        sub={
          secao === "compras"
            ? "O que falta comprar sai do orçamento aprovado, na ordem das etapas."
            : secao === "estoque"
              ? "Entradas, saídas e contagem do que está na obra."
              : "Quem fornece para a obra."
        }
        acao={
          <>
            {secao === "compras" ? <BotaoPlumo rotulo="Perguntar ao Plumo" /> : null}
            {acao}
          </>
        }
        menu={menu}
        rotuloMenu="Mais ações de Compras"
        barra={abas}
      />
      {erro ? (
        <div className="aviso-erro" role="alert">
          <Icone nome="alert" tam={15} />
          {erro}
        </div>
      ) : null}
      {carregando && !dado ? (
        <div className="carregando" role="status">
          <Icone nome="loader" className="spin" tam={15} />
          Carregando as compras…
        </div>
      ) : dado ? (
        secao === "compras" ? (
          // lado a lado no computador: o que falta (a coluna larga) e os pedidos em cartões; no celular, um embaixo do outro
          <div className={s.duas}>
            <FaltaComprar key={pedidosFeitos} itens={itens} etapas={etapas} fazerPedido={setMarcados} desfazendo={desfazendo} etapa={etapaRecorte} verTudo={() => setEtapaRecorte(null)} />
            <ListaPedidos obra={obra} pedidos={pedidos} itens={itens} etapas={etapas} fornecedores={fornecedores} />
          </div>
        ) : secao === "estoque" ? (
          <Itens obra={obra} itens={itens} etapas={etapas} lancar={setLancando} lancando={!!lancando} />
        ) : (
          <ListaFornecedores fornecedores={fornecedores} editar={podeOperar ? (f) => setModal({ k: "fornecedor", f }) : null} />
        )
      ) : null}

      {secao === "compras" && itens.length ? (
        <ProximoPasso
          obraId={obra.id}
          para="cronograma"
          acao="Ver o cronograma"
          secundario
          titulo="Quando cada compra precisa chegar?"
          texto="O cronograma distribui as etapas do orçamento pelos meses da obra."
        />
      ) : null}

      {marcados ? <ModalPedidoMarcados obraId={obra.id} marcados={marcados} etapas={etapas} fornecedores={fornecedores} pedidos={pedidos} chave={chavePedido} fechar={() => setMarcados(null)} criado={() => setPedidosFeitos((n) => n + 1)} /> : null}
      {lancando?.tipo === "pedido" ? (
        <ModalNovoPedido
          chave={chavePedido}
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
      {modal?.k === "item" ? <ModalNovoItem obraId={obra.id} uf={obra.uf || "SP"} fechar={() => setModal(null)} /> : null}
      {modal?.k === "fornecedor" ? <ModalFornecedor fornecedor={modal.f} fechar={() => setModal(null)} /> : null}
    </div>
  );
}
