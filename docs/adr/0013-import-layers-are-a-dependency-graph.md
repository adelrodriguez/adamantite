# Import layers are a dependency graph in a first-party rule

Target projects enforced one-way import layers by hand. Adamantite had one
`no-restricted-imports` override for each lib layer and a test to check them. packref had one
deny-list override for each `src/lib` folder, and its prose and its overrides disagreed. v1 and
100times had their own custom rules. We decided (2026-10-28, issue #522) that the first-party rule
`adamantite/layers` takes a layer map as options, so a project states its layers one time.

The layer map is a dependency graph, not an ordered list. Each layer lists the layers directly
below it, and imports are transitive. The first sketch used an ordered list of levels, but an
ordered list cannot state Adamantite's own layers: `hardening` sits beside `integrations`, and
`assessment` sits above `integrations` but does not import `hardening`. The graph also states
packref's prose and v1's layers without exceptions.

The rule lives in the first-party plugin, and the `strict` preset loads the plugin, as ADR 0006
intends for framework-neutral first-party rules. `strict` does not turn the rule on: a layer map
belongs to one project, and a rule that is on without a map would report nothing. There is no
config helper. The project turns on `adamantite/layers` with its map in its own Oxlint config.

The rule resolves each import with `oxc-resolver`, with Node.js `imports` conditions,
TypeScript extensions, and `tsconfig.json` `paths`, so parent-relative paths and aliases cannot
bypass it. A first version resolved relative and `#` imports by hand, in about 110 lines that
copied part of Node.js resolution and could not read `tsconfig.json`. An import that does not
resolve is outside the map, because TypeScript reports it. oxc-resolver does not read
`customConditions` from `tsconfig.json`, so the `conditions` option adds them, as an explicit
statement instead of a second reader of `tsconfig.json` and its `extends` chain. `root` is relative to the folder of
the nearest `package.json`, because `context.cwd` is the process working directory, and
Oxlint passes no config folder to a rule. A file below the root that is in no layer is a report,
so a new folder is never unrestricted. Type-only imports count unless `ignoreTypes` is set.

Messages need no project docs. The rule computes the repairs from the map: the highest layers
that both layers import, where shared code can move, and the lowest layers that import both,
where the importing file can move. It suggests an edit to the map only for a folder that is in no
layer, because an agent that reads "edit the map" takes the shortest path and weakens the
layers.

## More than one layer map

We decided (2026-10-28, issue #569) that each option after the severity is one complete layer
map, and the rule checks each map on its own. A file below two roots, such as `src/lib/shared`
below `src` and `src/lib`, must pass both maps. Oxlint applies one option set to each file, so
overrides cannot give a file two maps. Adamantite needs two: a `src` map keeps `lib` below
`terminal`, and a `src/lib` map holds the lib layers. Each message names the root of its map.
A `maps` key was rejected because it adds a second form of the same config, and nested layers
in one map were rejected because they make the graph, the repairs, and the messages more
complex. `no-restricted-syntax` uses the same variadic options.

## Considered options

- **Ordered levels with exceptions for each layer.** Short for packref and v1, but Adamantite
  needs an exception such as `without: ["hardening"]`, so the same thing has two forms.
- **A full allow-list for each layer, not transitive.** The most explicit, but it is the model
  that drifted in packref.
- **A `layers()` config helper.** It gave typed layer names, found the config folder from its
  call stack, and put the config line in messages. It was dropped, so that first-party rules
  configure like every other rule.
- **A `docs` option for messages.** It made the target project maintain a link that no tool
  checks. The computed repairs replace it.

## Consequences

- A typo in a layer name is a lint report on every file below the root, not a type error. A
  cycle in the map is a report too. The rule does not throw, because a rule that throws lets the
  run exit 0 (ADR 0009).
- `oxc-resolver` is a runtime dependency with native bindings. The plugin loads it for every
  first-party rule, not only for `layers`.
- The rule reads files when it lints, and the resolver caches them. An editor language server
  needs a restart after a `package.json` or `tsconfig.json` changes.
- v1 entrypoint tiers and feature role file names are follow-up options.
- A unit of an isolated layer is the first segment below the layer folder, so a route folder can
  import its own files. v1 isolated each route module.
