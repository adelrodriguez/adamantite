---
"adamantite": patch
---

Remove the default file exclusions from the analysis preset. The preset no longer sets `ignore: ["**/*.d.ts"]` or `ignoreFiles: ["**/dist/**", "**/build/**", "**/coverage/**", "**/.next/**", "**/.vercel/**", "**/.turbo/**"]`, so each project now declares the exclusions that match its own structure. Knip already honors `.gitignore`, so the build-output globs were mostly redundant; the change that can surface new `files` errors is the loss of `**/*.d.ts`, which affects projects with committed declaration files such as `vite-env.d.ts`. To keep the previous behavior, add the keys back in your own `knip.config.ts` after the `...analyze` spread.
