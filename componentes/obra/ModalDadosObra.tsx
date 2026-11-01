"use client";
/** Editar os dados da obra depois do cadastro. Manda só o que mudou: o registro diz exatamente o quê, e desfaz. */
import { useRef, useState } from "react";
import type { Obra } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { useCasca } from "../contexto";
import { Modal } from "../Dialogo";
import { ErroApi, useEnvio } from "../formularios/Campos";
import { CamposContrato, CamposOQue, CamposOnde, dadosDe, formDe, validarObra, type FormObra } from "./CamposObra";

export function ModalDadosObra({ obra, fechar }: { obra: Obra; fechar: () => void }) {
  const { avisar, avisarFeito, mudou } = useCasca();
  const [f, setF] = useState<FormObra>(() => formDe(obra));
  const nome = useRef<HTMLInputElement>(null);
  const mudar = (p: Partial<FormObra>) => setF((x) => ({ ...x, ...p }));
  const { erros, erroApi, ocupado, enviar } = useEnvio(
    () => validarObra(f, "tudo") as Record<string, string | null>,
    async () => {
      const dados = dadosDe(f, obra);
      if (!Object.keys(dados).length) {
        fechar();
        avisar("Nada mudou.");
        return;
      }
      const r = await api.editarObra(obra.id, dados);
      mudou();
      fechar();
      if (r.registro_id) avisarFeito("Dados da obra atualizados.", r.registro_id);
      else avisar("Nada mudou.");
    },
  );
  return (
    <Modal
      titulo="Dados da obra"
      fechar={fechar}
      focoInicial={nome}
      rodape={
        <>
          <button type="button" className="btn" onClick={fechar}>
            Voltar
          </button>
          <button type="submit" form="form-obra" className="btn amb" disabled={ocupado} aria-busy={ocupado}>
            Salvar
          </button>
        </>
      }
    >
      <form id="form-obra" onSubmit={enviar} noValidate>
        <CamposOnde f={f} mudar={mudar} erros={erros} nomeRef={nome} />
        <h3 className="sectit">O que é</h3>
        <CamposOQue f={f} mudar={mudar} erros={erros} />
        <h3 className="sectit">Contrato</h3>
        <CamposContrato f={f} mudar={mudar} erros={erros} />
        <ErroApi texto={erroApi} />
      </form>
    </Modal>
  );
}
