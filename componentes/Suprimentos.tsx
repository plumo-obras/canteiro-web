"use client";
/**
 * Compras: marcar o que falta comprar do orçamento, fazer o pedido e dizer quando chegou. Estoque (entradas, saídas,
 * contagem) e fornecedores ficam no "⋯": são consulta, não o trabalho do dia. A tela carrega uma vez o que as seções
 * usam, e a "versão" da casca recarrega tudo depois de cada escrita.
 */
import { useState } from "react";
import type { EtapaObra, Fornecedor, ItemInsumo, Obra } from "@/lib/contrato";
import { api } from "@/lib/cliente";
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

type Secao = "compras" | "estoque" | "fornecedores";

// Etapas e fornecedores são da Fase 2: se a rota ainda não existir (API antiga), a tela segue sem eles.
const ouVazio = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);

export function Suprimentos({ obra }: { obra: Obra }) {
  const { versao, podeOperar } = useCasca();
  const [secao, setSecao] = useState<Secao>("compras");
  const [lancando, setLancando] = useState<Lancar | null>(null);
  const [marcados, setMarcados] = useState<ItemInsumo[] | null>(null);
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

  const acao =
    podeOperar && dado && secao !== "compras" ? (
      secao === "fornecedores" ? (
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
  const menu =
    secao === "compras"
      ? [
          ...(podeOperar && dado ? [{ rotulo: "Pedido de item fora do orçamento", acao: () => setLancando({ tipo: "pedido" }) }] : []),
          { rotulo: "Estoque: entradas e saídas", acao: () => setSecao("estoque") },
          { rotulo: "Fornecedores", acao: () => setSecao("fornecedores") },
        ]
      : secao === "estoque" && podeOperar && dado
        ? [{ rotulo: "Novo item", acao: () => setModal({ k: "item" }) }]
        : [];

  return (
    <div className="page">
      <CabecalhoPagina
        titulo={secao === "compras" ? "Compras" : secao === "estoque" ? "Estoque" : "Fornecedores"}
        sub={secao === "compras" ? "Marque o que vai comprar do orçamento e faça o pedido." : undefined}
        acao={acao}
        menu={menu}
        rotuloMenu="Mais ações de Compras"
      />
      {secao !== "compras" ? (
        <button type="button" className="voltar-link" onClick={() => setSecao("compras")}>
          ← Compras
        </button>
      ) : null}
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
          <>
            <FaltaComprar itens={itens} etapas={etapas} fazerPedido={setMarcados} />
            <ListaPedidos obra={obra} pedidos={pedidos} itens={itens} etapas={etapas} fornecedores={fornecedores} />
          </>
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

      {marcados ? <ModalPedidoMarcados obraId={obra.id} marcados={marcados} etapas={etapas} fornecedores={fornecedores} pedidos={pedidos} fechar={() => setMarcados(null)} /> : null}
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
      {modal?.k === "item" ? <ModalNovoItem obraId={obra.id} uf={obra.uf || "SP"} fechar={() => setModal(null)} /> : null}
      {modal?.k === "fornecedor" ? <ModalFornecedor fornecedor={modal.f} fechar={() => setModal(null)} /> : null}
    </div>
  );
}
