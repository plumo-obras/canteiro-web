/**
 * Texto do agente em Markdown. O texto do modelo é dado, nunca marcação: HTML cru é ignorado, imagem não entra, link só
 * http/https e sempre em outra aba sem `opener`. Durante o streaming o texto chega cortado em qualquer ponto (até no
 * meio de um `**`), então fechamos o que ficou aberto antes de renderizar: o negrito não pisca como asterisco solto.
 */
import { memo } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

// Quebra simples vira <br>: o agente põe a linha de conta numa linha própria, sem linha em branco.
const PLUGINS = [remarkGfm, remarkBreaks];
const PROIBIDOS = ["img"];

/** Só http/https sobrevivem; o resto (javascript:, data:, relativo) vira texto sem link. */
export function urlSegura(url: string): string {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : "";
  } catch {
    return "";
  }
}

/**
 * Fecha o Markdown que o corte do streaming deixou aberto: bloco de código, código inline e negrito. Um `*` solto no fim
 * é quase sempre a metade de um `**` que ainda vai chegar; some até o próximo delta para não aparecer e sumir.
 */
export function completarParcial(texto: string): string {
  if (((texto.match(/^\s*```/gm) ?? []).length) % 2) return `${texto}\n\`\`\``;
  let s = texto.replace(/(^|[^*])\*$/, "$1");
  const semCodigo = s.replace(/`[^`\n]*`/g, "");
  if (((semCodigo.match(/`/g) ?? []).length) % 2) return `${s}\``;
  if (((semCodigo.match(/\*\*/g) ?? []).length) % 2) {
    const i = s.lastIndexOf("**");
    const depois = s.slice(i + 2);
    // Fechar um negrito vazio viraria "****" literal; e o fecho não pode vir depois de espaço (não seria negrito).
    s = depois.trim() ? `${s.slice(0, i + 2)}${depois.trimEnd()}**${depois.slice(depois.trimEnd().length)}` : s.slice(0, i);
  }
  return s;
}

const COMPONENTES: Components = {
  strong: ({ children }) => <b>{children}</b>,
  a: ({ href, children }) =>
    href ? (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  // Título grande numa resposta curta grita; tudo vira o mesmo subtítulo discreto.
  h1: ({ children }) => <h3>{children}</h3>,
  h2: ({ children }) => <h3>{children}</h3>,
  h4: ({ children }) => <h3>{children}</h3>,
  h5: ({ children }) => <h3>{children}</h3>,
  h6: ({ children }) => <h3>{children}</h3>,
  // A tabela rola dentro do balão, nunca a página.
  table: ({ children }) => (
    <div className="md-tabela" role="region" aria-label="Tabela" tabIndex={0}>
      <table>{children}</table>
    </div>
  ),
};

/** Memo por mensagem: só a que está chegando re-renderiza a cada delta; as anteriores ficam paradas. */
export const MensagemMarkdown = memo(function MensagemMarkdown({ texto, vivo = false }: { texto: string; vivo?: boolean }) {
  return (
    <div className={`md${vivo ? " vivo" : ""}`}>
      <Markdown remarkPlugins={PLUGINS} components={COMPONENTES} disallowedElements={PROIBIDOS} skipHtml urlTransform={urlSegura}>
        {vivo ? completarParcial(texto) : texto}
      </Markdown>
    </div>
  );
});
