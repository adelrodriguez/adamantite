---
"adamantite": minor
---

Update Biome to 2.3.2 and enable script/style tag indentation

**Updated Dependencies:**

Core dependencies:

- `@biomejs/biome` from 2.3.0 to 2.3.2

Development dependencies:

- `tsdown` from 0.15.9 to 0.15.11

**Configuration Changes:**

- **Script and style indentation**: Changed `indentScriptAndStyle` from `false` to `true` in the HTML formatter configuration. This enables automatic indentation of code within `<script>` and `<style>` tags in HTML and JSX files, improving code readability and consistency. Previously, content within these tags was not indented, but now they will be formatted with proper indentation matching the rest of the document.

These updates bring the latest bug fixes and improvements from Biome 2.3.2, along with enhanced formatting consistency for HTML and JSX files containing embedded scripts and styles.
