"use client";
/**
 * Fornecedores da empresa (valem para todas as obras): a lista e o cadastro. O CNPJ é o que amarra o fornecedor (a API
 * recusa repetido); a máscara e o dígito verificador conferem aqui antes de enviar, e o que a API devolve é a palavra
 * final. O pedido escolhe daqui ou leva só o nome digitado.
 */
import { useRef, useState } from "react";
import type { Fornecedor } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { cnpjValido, digitosCnpj, mascararCnpj } from "@/lib/cnpj";
import { useCasca } from "../contexto";
import { Modal } from "../Dialogo";
import { Icone } from "../Icone";
import { Campo, ErroApi, useEnvio } from "../formularios/Campos";

export function ListaFornecedores({ fornecedores, editar }: { fornecedores: Fornecedor[]; editar: ((f: Fornecedor) => void) | null }) {
  if (!fornecedores.length)
    return (
      <div className="card vazio">
        <Icone nome="predio" tam={24} />
        <h3>Nenhum fornecedor cadastrado</h3>
        <p>Cadastre quem vende e presta serviço para a empresa: o pedido escolhe daqui, e a folha impressa sai com o CNPJ.</p>
      </div>
    );
  return (
    <div className="card lista">
      <table className="tbl-forn">
        <thead>
          <tr>
            <th scope="col">Fornecedor</th>
            <th scope="col">CNPJ</th>
            <th scope="col">Contato</th>
            {editar ? <th scope="col" className="sr-only">Ações</th> : null}
          </tr>
        </thead>
        <tbody>
          {[...fornecedores]
            .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
            .map((f) => (
              <tr key={f.id}>
                <td>
                  <b>{f.nome}</b>
                </td>
                <td className="forn-cnpj">{f.cnpj ? mascararCnpj(f.cnpj) : "—"}</td>
                <td className="sm">{[f.contato, f.telefone, f.email].filter(Boolean).join(" · ") || "—"}</td>
                {editar ? (
                  <td className="num">
                    <button type="button" className="btn sm" onClick={() => editar(f)} aria-label={`Editar ${f.nome}`}>
                      Editar
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

export function ModalFornecedor({ fornecedor, fechar }: { fornecedor?: Fornecedor; fechar: () => void }) {
  const { avisar, mudou } = useCasca();
  const [nome, setNome] = useState(fornecedor?.nome ?? "");
  const [cnpj, setCnpj] = useState(fornecedor?.cnpj ? mascararCnpj(fornecedor.cnpj) : "");
  const [contato, setContato] = useState(fornecedor?.contato ?? "");
  const [telefone, setTelefone] = useState(fornecedor?.telefone ?? "");
  const [email, setEmail] = useState(fornecedor?.email ?? "");
  const primeiro = useRef<HTMLInputElement>(null);

  const { erros, erroApi, ocupado, enviar } = useEnvio(
    () => ({
      nome: !nome.trim() ? "Dê o nome do fornecedor, ex.: Areial São João." : nome.trim().length > 120 ? "Nome muito longo (até 120 letras)." : null,
      cnpj: cnpj.trim() && !cnpjValido(cnpj) ? "CNPJ inválido: confira os 14 números." : null,
      email: email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? "E-mail inválido." : null,
    }),
    async () => {
      const dados = { nome: nome.trim(), cnpj: digitosCnpj(cnpj), contato: contato.trim(), telefone: telefone.trim(), email: email.trim() };
      if (fornecedor) {
        const mudou_ = Object.fromEntries(Object.entries(dados).filter(([k, v]) => (fornecedor as unknown as Record<string, string>)[k] !== v));
        if (!Object.keys(mudou_).length) return fechar();
        await api.editarFornecedor(fornecedor.id, mudou_);
      } else await api.criarFornecedor(dados);
      mudou();
      fechar();
      avisar(fornecedor ? `${dados.nome} atualizado.` : `${dados.nome} cadastrado.`);
    },
  );

  return (
    <Modal
      titulo={fornecedor ? "Editar fornecedor" : "Novo fornecedor"}
      fechar={fechar}
      focoInicial={primeiro}
      rodape={
        <>
          <button type="button" className="btn" onClick={fechar}>
            Voltar
          </button>
          <button type="submit" form="form-forn" className="btn amb" disabled={ocupado} aria-busy={ocupado}>
            {fornecedor ? "Salvar" : "Cadastrar"}
          </button>
        </>
      }
    >
      <form id="form-forn" onSubmit={enviar} noValidate>
        <Campo rotulo="Nome" erro={erros.nome}>
          {(a) => <input {...a} ref={primeiro} className="f" autoComplete="off" value={nome} onChange={(e) => setNome(e.target.value)} />}
        </Campo>
        <Campo rotulo="CNPJ (opcional)" erro={erros.cnpj} dica="Sai na folha do pedido.">
          {(a) => (
            <input
              {...a}
              className="f"
              inputMode="numeric"
              autoComplete="off"
              placeholder="00.000.000/0000-00"
              maxLength={18}
              value={cnpj}
              onChange={(e) => setCnpj(mascararCnpj(e.target.value))}
            />
          )}
        </Campo>
        <div className="campos2">
          <Campo rotulo="Contato (opcional)">
            {(a) => <input {...a} className="f" autoComplete="off" value={contato} onChange={(e) => setContato(e.target.value)} />}
          </Campo>
          <Campo rotulo="Telefone (opcional)">
            {(a) => <input {...a} className="f" type="tel" autoComplete="off" value={telefone} onChange={(e) => setTelefone(e.target.value)} />}
          </Campo>
        </div>
        <Campo rotulo="E-mail (opcional)" erro={erros.email}>
          {(a) => <input {...a} className="f" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Campo>
        <ErroApi texto={erroApi} />
      </form>
    </Modal>
  );
}
