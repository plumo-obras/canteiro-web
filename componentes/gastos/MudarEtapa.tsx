"use client";
/**
 * Mudar a etapa de um gasto já lançado (admin). Existe para o gasto que ficou "sem etapa do orçamento" quando a obra
 * passou a usar as etapas do orçamento, mas vale para qualquer gasto lançado na etapa errada. Volta com Desfazer.
 */
import { useId, useState } from "react";
import type { EtapaNaArvore, GastoObra } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { fmtReais } from "@/lib/formato";
import { mensagemDe, useCasca } from "../contexto";
import { Modal } from "../Dialogo";
import { Icone } from "../Icone";
import { nomeComCodigo } from "./escolhas";

export function MudarEtapa({ gasto, arvore, fechar }: { gasto: GastoObra; arvore: EtapaNaArvore[]; fechar: () => void }) {
  const { mudou, avisarFeito } = useCasca();
  const naArvore = arvore.some((e) => e.chave === gasto.etapa);
  const [etapa, setEtapa] = useState(naArvore ? gasto.etapa : "");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const id = useId();
  const mesma = etapa === gasto.etapa;

  const salvar = async () => {
    if (!etapa || mesma) return;
    setOcupado(true);
    setErro(null);
    try {
      const r = await api.mudarEtapaGasto(gasto.id, etapa);
      const no = arvore.find((e) => e.chave === etapa);
      mudou();
      // a etapa logo no começo: no celular o aviso corta em 2 linhas, e o que importa é para onde o gasto foi
      avisarFeito(`${fmtReais(gasto.valor)} agora em ${no ? nomeComCodigo(no) : etapa}.`, r.registro_id);
      fechar();
    } catch (e) {
      setErro(mensagemDe(e));
      setOcupado(false);
    }
  };

  return (
    <Modal
      titulo="Mudar etapa do gasto"
      fechar={fechar}
      rodape={
        <>
          <button type="button" className="btn" onClick={fechar}>
            Cancelar
          </button>
          <button type="button" className="btn amb" disabled={!etapa || mesma || ocupado} aria-busy={ocupado} onClick={salvar}>
            {ocupado ? <Icone nome="loader" className="spin" tam={14} /> : null}
            Mudar etapa
          </button>
        </>
      }
    >
      <p className="mut sm">
        {gasto.descricao} · {gasto.favorecido} · {fmtReais(gasto.valor)}
      </p>
      <div className="campo">
        <label className="l" htmlFor={id}>
          Etapa
        </label>
        <select id={id} className="f" value={etapa} onChange={(e) => setEtapa(e.target.value)}>
          <option value="">Escolha a etapa…</option>
          {arvore.map((e) => (
            <option key={e.chave} value={e.chave}>
              {nomeComCodigo(e)}
            </option>
          ))}
        </select>
        {!naArvore ? <div className="campo-dica">A etapa em que ele estava não existe mais na obra: escolha a nova.</div> : null}
      </div>
      {erro ? (
        <div className="aviso-erro form-erro" role="alert">
          {erro}
        </div>
      ) : null}
    </Modal>
  );
}
