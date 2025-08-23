---
"adamantite": minor
---

Comprehensive update to Biome configuration rules with stricter linting and formatting standards.

## Rule Changes

### A11y Section

- **Added**: `noAutofocus` - error (previously off)
- **Added**: `noNoninteractiveElementInteractions` - error
- **Reorganized**: Better organization with JavaScript and CSS subsections
- **Removed**: Verbose rule comments for cleaner configuration

### Complexity Section

- **Added 25+ new rules** including:
  - `noExtraBooleanCast` - error
  - `noStaticOnlyClass` - error
  - `noThisInStatic` - error
  - `noUselessContinue` - error
  - `noUselessEmptyExport` - error
  - `noUselessEscapeInRegex` - error
  - `noUselessFragments` - error
  - `noUselessLabel` - error
  - `noUselessLoneBlockStatements` - error
  - `noUselessRename` - error
  - `noUselessStringConcat` - error
  - `noUselessStringRaw` - error
  - `noUselessSwitchCase` - error
  - `noUselessTernary` - error
  - `noUselessThisAlias` - error
  - `noUselessTypeConstraint` - error
  - `noUselessUndefinedInitialization` - error
  - `useArrowFunction` - error
  - `useDateNow` - error
  - `useFlatMap` - error
  - `useLiteralKeys` - error
  - `useNumericLiterals` - error
  - `useOptionalChain` - error
  - `useRegexLiterals` - error
  - `useSimpleNumberKeys` - error
- **Changed**: `maxAllowedComplexity` increased from 18 to 20

### Correctness Section

- **Added**: `noGlobalDirnameFilename` - error
- **Added**: `noNestedComponentDefinitions` - error
- **Added**: `noProcessGlobal` - off
- **Added**: `useJsonImportAttributes` - error
- **Added**: `useParseIntRadix` - error
- **Added**: `useSingleJsDocAsterisk` - error
- **Added**: `useUniqueElementIds` - error (previously off)
- **Added**: `noReactPropAssignments` - error
- **Added**: `noRestrictedElements` - error
- **Removed**: `noUndeclaredDependencies` - off
- **Removed**: `useImportExtensions` - off

### Nursery Section

- **Enabled previously disabled rules**:
  - `noFloatingPromises` - error (was off)
  - `noMisusedPromises` - error (was off)
- **Added**: `noNonNullAssertedOptionalChain` - error
- **Added**: `noUnnecessaryConditions` - error
- **Added**: `useReactFunctionComponents` - error
- **Added**: `useAnchorHref` - error
- **Removed**: `useExplicitType` - off
- **Removed**: `noSecrets` - off
- **Removed**: `noImportCycles` - off

### Performance Section

- **Removed**: `noBarrelFile` - off
- **Removed**: `noImgElement` - error
- **Removed**: `noNamespaceImport` - off
- **Removed**: `noReExportAll` - off

### Style Section

- **Added**: `useConsistentObjectDefinitions` - error
- **Added**: `useExportsLast` - error (was off)
- **Added**: `useGroupedAccessorPairs` - error
- **Added**: `useNumericSeparators` - error
- **Added**: `useObjectSpread` - error
- **Added**: `useSymbolDescription` - error
- **Changed**: `useExplicitLengthCheck` - error (was off)
- **Changed**: `useSingleVarDeclarator` - error (was off)
- **Removed**: `noCommonJs` - off
- **Removed**: `noDefaultExport` - off
- **Removed**: `noNestedTernary` - off
- **Removed**: `noProcessEnv` - off
- **Removed**: `useComponentExportOnlyModules` - off

### Suspicious Section

- **Added**: `noBitwiseOperators` - error
- **Added**: `noConstantBinaryExpressions` - error
- **Added**: `noTsIgnore` - error
- **Added**: `noUselessEscapeInString` - error
- **Added**: `noUselessRegexBackrefs` - error
- **Added**: `useIterableCallbackReturn` - error
- **Added**: `useStaticResponseMethods` - error
- **Added**: `noBiomeFirstException` - error
- **Added**: `noQuickfixBiome` - error

## CLI Enhancements

- **Added**: `--summary` flag to the `lint` command for concise lint result reporting using Biome's summary reporter

This update significantly strengthens the linting rules with a focus on code quality, consistency, and best practices while maintaining TypeScript and React compatibility.
