"""Plano do CI e leitura dos recibos emitidos como etapas do job gate no GitHub."""
import json
import os
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path


def git(*args):
    return subprocess.check_output(["git", *args])


def api(path):
    return json.loads(subprocess.check_output(
        ["gh", "api", "repos/{}/{}".format(os.environ["GITHUB_REPOSITORY"], path)],
        timeout=15,
    ))


def recibos(arvores):
    """O GitHub registra o nome e o resultado da etapa, fora do ambiente dos testes."""
    encontrados = set()
    repo = os.environ["GITHUB_REPOSITORY"]
    limite = (datetime.now(timezone.utc) - timedelta(days=7)).date().isoformat()
    try:
        runs = api(f"actions/workflows/ci.yml/runs?status=success&created=%3E%3D{limite}&per_page=30")
        for run in runs["workflow_runs"]:
            if (run["event"] not in {"push", "pull_request"} or
                    (run["head_repository"] or {}).get("full_name") != repo):
                continue
            if run["event"] == "push" and run["head_branch"] != "main":
                continue
            # Um PR que mudou o emissor não pode atestar conteúdo de outra política.
            controle = [".github/workflows/ci.yml", "scripts/plano-ci.py", "scripts/check-gate.sh"]
            if subprocess.run(["git", "diff", "--quiet", run["head_sha"], "HEAD", "--", *controle],
                              stderr=subprocess.DEVNULL).returncode:
                continue
            for job in api(f"actions/runs/{run['id']}/attempts/{run['run_attempt']}/jobs")["jobs"]:
                if job["name"] == "gate" and job["conclusion"] == "success":
                    verdes = {s["name"] for s in job["steps"] if s["conclusion"] == "success"}
                    encontrados.update(a for a in arvores if f"recibo-{a}" in verdes)
            if encontrados == arvores:
                break
    except (OSError, subprocess.SubprocessError, ValueError, KeyError):
        print("Consulta de recibos indisponível. Verificando sem reaproveitamento.")
        return set()
    return encontrados


def editorial(path):
    return (path in {"README.md", "CLAUDE.md", "AGENTS.md", "DESIGN.md", "FLUXOS.md", "PRODUCT.md"}
            or path.startswith("docs/") and path.endswith(".md"))


def planejar(pr, arquivos, igual, base_verde):
    if igual:
        return False, False, False, True, "árvore aprovada"
    if pr and arquivos and all(editorial(a) for a in arquivos):
        return False, False, True, base_verde, "documentação"
    if pr and arquivos and all(editorial(a) or a.startswith("site/") for a in arquivos):
        return False, False, True, base_verde, "landing e documentação"
    return True, True, False, True, "código ou base desconhecida"


def main():
    pr = os.environ["GITHUB_EVENT_NAME"] == "pull_request"
    arvore = git("rev-parse", "HEAD^{tree}").decode().strip()
    candidatas = {arvore}
    base = ""
    arquivos = []
    if pr:
        sha = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())["pull_request"]["base"]["sha"]
        base = git("rev-parse", f"{sha}^{{tree}}").decode().strip()
        candidatas.add(base)
        arquivos = git("diff", "--no-renames", "--name-only", "-z", sha, "HEAD").decode(
            errors="surrogateescape").split("\0")[:-1]
    verdes = recibos(candidatas)
    web, imagem, leve, emitir, motivo = planejar(pr, arquivos, arvore in verdes, base in verdes)
    saida = {"web": web, "imagem": imagem, "leve": leve, "emitir": emitir}
    print(motivo, arvore, saida)
    with open(os.environ["GITHUB_OUTPUT"], "a") as out:
        print(f"arvore={arvore}", file=out)
        for k, v in saida.items():
            print(f"{k}={str(v).lower()}", file=out)


if __name__ == "__main__":
    main()
