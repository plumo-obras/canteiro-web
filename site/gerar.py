#!/usr/bin/env python3
"""Gera as três versões da landing (pt em /, es em /es/, en em /en/) a partir de modelo.html e i18n/*.json.

O site continua estático e sem build na Vercel: os HTML gerados são versionados. Com --conferir, só verifica se estão
em dia (o CI usa isso para ninguém editar um index.html na mão e perder na próxima geração).
"""
import json
import re
import sys
from pathlib import Path

AQUI = Path(__file__).parent
IDIOMAS = {"pt": "/", "es": "/es/", "en": "/en/"}
LOGO = ('<svg class="marca{cls}" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#e8b04a"/>'
        '<path d="M22 12h12a10 10 0 0 1 0 20H22" fill="none" stroke="#0f1a2e" stroke-width="6" stroke-linecap="round" '
        'stroke-linejoin="round"/><path d="M22 12v26" stroke="#0f1a2e" stroke-width="3" stroke-linecap="round"/>'
        '<path d="M18 37.5h8v3l-4 13-4-13z" fill="#0f1a2e" stroke="#0f1a2e" stroke-width="1.6" stroke-linejoin="round"/></svg>')

# Só a raiz escolhe o idioma: quem já escolheu no seletor fica no que escolheu; quem nunca escolheu vai para o idioma
# do navegador. Um link direto para /es/ ou /en/ é respeitado como veio. Idioma fora dos três cai no inglês.
REDIRECIONA = (
    "(function(){var s;try{s=localStorage.getItem('plumo.idioma')}catch(e){}"
    "if(/[?&]lang=pt\\b/.test(location.search))return;"
    "if(!s){var l=navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||''];"
    "for(var i=0;i<l.length&&!s;i++){var c=(l[i]||'').toLowerCase().slice(0,2);if(c==='pt'||c==='es'||c==='en')s=c}"
    "s=s||'en'}"
    "if(s==='es'||s==='en')location.replace('/'+s+'/'+location.search+location.hash)})();"
)


def gerar(codigo: str) -> str:
    modelo = (AQUI / "modelo.html").read_text()
    t = json.loads((AQUI / "i18n" / f"{codigo}.json").read_text())
    js = json.dumps(t.pop("js"), ensure_ascii=False).replace("</", "<\\/")
    valores = {**t, "codigo": codigo, "caminho": IDIOMAS[codigo], "js": js,
               "logo": LOGO.format(cls=""), "logo_pq": LOGO.format(cls=" pq"),
               "redireciona": REDIRECIONA if codigo == "pt" else ""}
    for c in IDIOMAS:
        valores[f"atual_{c}"] = ' aria-current="page"' if c == codigo else ""

    def troca(m):
        chave = m.group(1)
        if chave not in valores:
            raise KeyError(f"{codigo}: falta a chave {chave!r}")
        return str(valores[chave])

    return re.sub(r"\{\{(\w+)\}\}", troca, modelo)


def destino(codigo: str) -> Path:
    return AQUI / IDIOMAS[codigo].strip("/") / "index.html"


if __name__ == "__main__":
    conferir = "--conferir" in sys.argv
    desatualizados = []
    for codigo in IDIOMAS:
        html, alvo = gerar(codigo), destino(codigo)
        if conferir:
            if not alvo.exists() or alvo.read_text() != html:
                desatualizados.append(str(alvo.relative_to(AQUI)))
        else:
            alvo.parent.mkdir(parents=True, exist_ok=True)
            alvo.write_text(html)
            print("gerado", alvo.relative_to(AQUI))
    if desatualizados:
        sys.exit("Desatualizado(s): " + ", ".join(desatualizados) + ". Rode python3 apps/site/gerar.py")
