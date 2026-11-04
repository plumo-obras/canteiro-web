// O typescript-eslint ainda não roda no TypeScript 7 (o compilador nativo não traz a API em JS que o parser usa):
// os pacotes dele recebem o TypeScript 6 como dependência própria, e o resto do projeto segue no 7.
const TS_DO_LINT = "6.0.3";

module.exports = {
  hooks: {
    readPackage(pkg) {
      if (pkg.name && pkg.name.startsWith("@typescript-eslint/") && pkg.peerDependencies && pkg.peerDependencies.typescript) {
        delete pkg.peerDependencies.typescript;
        pkg.dependencies = { ...pkg.dependencies, typescript: TS_DO_LINT };
      }
      return pkg;
    },
  },
};
