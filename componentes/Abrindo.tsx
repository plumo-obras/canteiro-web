"use client";
import Link from "next/link";

/**
 * A espera antes de montar o app. Sem a API respondendo, a tela dizia só "Abrindo…" para sempre e parecia travada:
 * agora diz o que está acontecendo e dá saída (tentar já ou entrar de novo), enquanto segue tentando sozinha.
 */
export function Abrindo({ semServidor, tentarAgora }: { semServidor: boolean; tentarAgora: () => void }) {
  return (
    <div className="abrindo" role="status">
      <div className="abrindo-corpo">
        <p>Abrindo o Plumo…</p>
        {semServidor && (
          <>
            <p className="mut sm">O servidor não respondeu. Tentando de novo a cada 3 segundos.</p>
            <div className="abrindo-acoes">
              <button type="button" className="btn sm" onClick={tentarAgora}>
                Tentar agora
              </button>
              <Link href="/entrar" className="btn sm">
                Entrar de novo
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
