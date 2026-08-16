---
"adamantite": patch
---

Stop shipping the raw `presets/*.ts` sources in the npm package. The published tarball now contains only the compiled `dist/presets` output that the package exports already point to, which removes duplicate files and shrinks the unpacked size from 311 kB to 196 kB.
