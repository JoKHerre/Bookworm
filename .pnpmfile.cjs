// typescript-eslint doesn't support TypeScript 7 yet. Give its packages their
// own copy of the TS 6 API instead of the repo's TypeScript 7 peer, so `tsc`
// stays on 7 while ESLint parses with 6. Remove once typescript-eslint supports TS 7.
const TS6 = "npm:@typescript/typescript6@^6.0.2";

function readPackage(pkg) {
  if (
    pkg.name === "typescript-eslint" ||
    pkg.name?.startsWith("@typescript-eslint/")
  ) {
    if (pkg.peerDependencies?.typescript) {
      delete pkg.peerDependencies.typescript;
      if (pkg.peerDependenciesMeta) delete pkg.peerDependenciesMeta.typescript;
      pkg.dependencies = { ...pkg.dependencies, typescript: TS6 };
    }
  }
  return pkg;
}

module.exports = { hooks: { readPackage } };
