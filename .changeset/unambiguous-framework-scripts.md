---
"adamantite": patch
---

Accept an Astro, Vue, or Svelte script without an `import` or `export` in the core preset

The core lint preset no longer reports `import/unambiguous` in `.astro`, `.vue`, and `.svelte` files. These frameworks compile a component's script as a module, but Oxlint reported a script with no `import` or `export` as one that could be parsed as a script. Suppressions and placeholder exports that you added for this rule in these files are now unneeded, so you can delete them. The rule still reports `.js` and `.ts` files.
