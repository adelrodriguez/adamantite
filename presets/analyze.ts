import type { KnipConfiguration } from "knip"

const config: KnipConfiguration = {
  ignore: ["**/*.d.ts"],
  ignoreExportsUsedInFile: true,
  ignoreFiles: [
    "**/dist/**",
    "**/build/**",
    "**/coverage/**",
    "**/.next/**",
    "**/.vercel/**",
    "**/.turbo/**",
  ],
  rules: {
    binaries: "error",
    catalog: "error",
    dependencies: "error",
    devDependencies: "error",
    duplicates: "warn",
    enumMembers: "off",
    exports: "warn",
    files: "error",
    namespaceMembers: "warn",
    nsExports: "warn",
    nsTypes: "warn",
    optionalPeerDependencies: "warn",
    types: "warn",
    unlisted: "error",
    unresolved: "error",
  },
}

export default config
