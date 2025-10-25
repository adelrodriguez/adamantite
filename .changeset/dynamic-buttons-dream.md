---
"adamantite": minor
---

Update Biome to 2.3.0 and improve configuration defaults

**Updated Dependencies:**

Core dependencies:
- `@biomejs/biome` from 2.2.6 to 2.3.0

Development dependencies:
- `@types/bun` from 1.3.0 to 1.3.1
- `sherif` from 1.6.1 to 1.7.0
- `tsdown` from 0.15.7 to 0.15.9

**Configuration Changes:**

- **Line endings**: Changed from `"lf"` to `"auto"` for better cross-platform compatibility. The formatter will now preserve the existing line ending style in files rather than enforcing Unix-style line endings.
- **New rule**: Added `useImageSize` rule (set to `"error"`) to enforce width and height attributes on image elements for improved performance and layout stability.

**Development Environment:**

- VSCode settings updated to use Biome as the default formatter
- Added `test/` directory for future test infrastructure

These updates bring the latest improvements and bug fixes from Biome 2.3.0, along with enhanced cross-platform support and additional best practices for web development.
