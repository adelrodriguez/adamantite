---
"adamantite": patch
---

Add framework preset selection to init command

The `adamantite init` command now prompts for presets (React, Next.js, Vue, Jest, Vitest, Node) when choosing linting scripts. Selected presets are automatically applied to the oxlint configuration, eliminating manual setup.

Also adds new framework presets with complete rule sets: Next.js (`nextjs.json`), Jest (`jest.json`), Vitest (`vitest.json`), and Vue.js (`vue.json`). Expands React preset (`react.json`) with React/JSX-a11y/React-perf rules and adds `node/no-exports-assign` to Node.js preset (`node.json`).
