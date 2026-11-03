import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // a imagem Docker roda o servidor enxuto que o Next gera em .next/standalone (a Vercel ignora esta opção)
  output: "standalone",
  devIndicators: false,
  // Só no dev: o CSS do Turbopack tem nome fixo, e o WebKit (o portal do Octopus) reaproveitava a versão velha mesmo
  // com recarga limpa. Em produção o nome do arquivo já muda com o conteúdo, e o cache longo do Next continua valendo.
  async headers() {
    if (process.env.NODE_ENV !== "development") return [];
    return [{ source: "/_next/static/:caminho*", headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }] }];
  },
};

export default config;
