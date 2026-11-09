/**
 * Criar pedido com chave de idempotência. A chave vale até o pedido existir: se a resposta se perder, reenviar devolve
 * o mesmo pedido em vez de criar outro. O erro relê a tela, que mostra o que realmente foi gravado.
 */
import type { RefObject } from "react";
import type { CorpoPedido } from "@/lib/contrato";
import { api, ErroApi } from "@/lib/cliente";
import { uuid7 } from "@/lib/ids";

export type ChavePedido = RefObject<string>;

export async function criarPedidoComChave(chave: ChavePedido, mudou: () => void, obraId: string, corpo: CorpoPedido) {
  try {
    const p = await api.criarPedido(obraId, { ...corpo, chave_idempotencia: chave.current });
    chave.current = uuid7();
    return p;
  } catch (e) {
    // 409: a chave já foi gasta num pedido, ou a obra recusou; repetir a mesma só daria o mesmo erro para sempre
    if (e instanceof ErroApi && e.status === 409) chave.current = uuid7();
    mudou();
    throw e;
  }
}
