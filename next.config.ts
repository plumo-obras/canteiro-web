import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // a imagem Docker roda o servidor enxuto que o Next gera em .next/standalone (a Vercel ignora esta opção)
  output: "standalone",
  devIndicators: false,
  async headers() {
    // Ninguém embute o app num iframe: com a sessão voltando pelo cookie, um clique induzido aprovaria uma proposta.
    const seguranca = [
      { source: "/:caminho*", headers: [
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ] },
    ];
    // O editor CAD (public/cadcraft) roda dentro da tela Projeto 3D: só ele pode ser embutido, e só pelo próprio
    // Prumo (mesma origem). O resto do app continua sem iframe nenhum.
    seguranca.push({ source: "/cadcraft/:caminho*", headers: [
      { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ] });
    if (process.env.NODE_ENV !== "development") return seguranca;
    // Só no dev: o CSS do Turbopack tem nome fixo, e o WebKit (o portal do Octopus) reaproveitava a versão velha mesmo
    // com recarga limpa. Em produção o nome do arquivo já muda com o conteúdo, e o cache longo do Next continua valendo.
    return [
      ...seguranca,
      { source: "/_next/static/:caminho*", headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }] },
    ];
  },
};

export default config;
