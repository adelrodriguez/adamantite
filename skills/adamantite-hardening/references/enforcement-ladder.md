# The enforcement ladder

The enforcement ladder orders the places that can hold a coding standard, from strongest to weakest. Put each standard on the highest step that can hold it.

1. **Type or structure:** a type, a schema, a constructor, a module boundary, or a stricter TypeScript option makes the mistake impossible.
2. **Preset rule:** a rule in an Oxlint preset or plugin that the project can turn on, or an option of a rule that is already on. A native rule, such as a file-name rule, comes before a custom rule that checks the same thing.
3. **Import rule:** `adamantite/layers` for one-way imports between the folders of a root, `adamantite/import-owners` for a package that only one file or folder imports, or `no-restricted-imports` with an override for the files that the standard applies to. In Oxlint, a later override replaces the options of a rule that an earlier override set for the same files. Write one combined `no-restricted-imports` for each set of files, with the paths of the existing overrides.
4. **Project check:** a check that the project already runs, such as a test, Turbo boundaries, Knip, or a script that reads `package.json`. A test holds a standard about behavior, such as the result at a boundary value, which no rule can check.
5. **Custom rule:** a rule in the rules folder that checks the AST.
6. **Instruction:** an entry in `CODING_STANDARDS.md`, for a standard that needs judgment or that no step above can check. The entry states the standard, the reason for it, how to spot the mistake, and one example from the project of the code to avoid and the code to prefer.

Choose a step by the mistake that it prevents and the similar valid code that it accepts. A step that reports valid code cannot hold the standard, so use a lower step. When a step can hold only part of a standard, put the other part on a lower step.

A code comment is not a step. When a comment states a standard or an invariant of the project's own code, put the standard on a step and delete the comment.
