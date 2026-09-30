---
"adamantite": minor
---

Add the `adamantite/lint/react-doctor` preset for React state and effect misuse

The preset enables 12 curated rules from [React Doctor](https://github.com/millionco/react-doctor) at `error`. They report state changed in place, impure state updaters, stores created during render, effects that do the work of an event handler or exist only to react to trigger state, data fetched in an effect, state set after an `await` in an effect, live state pushed to a parent, and observers or animation frame loops that an effect does not clean up. The preset leaves out rules that the native `react`, `react-hooks`, `jsx-a11y`, and `unicorn` rules already report, and the TanStack Query and TanStack Start rules.

Use the preset together with the `react` preset. It adds to `react-strict` and does not replace it.

`oxlint-plugin-react-doctor` is a managed plugin. Select the preset in `adamantite init` or with `--preset react --preset react-doctor`, and `init` installs the pinned version. `adamantite doctor` reports a missing or outdated package, and `adamantite update` moves it with the other managed dependencies. If you add the preset to `oxlint.config.ts` by hand, install `oxlint-plugin-react-doctor` too.

The plugin has a modified MIT license. Using it as machine learning training data, or selling it as a hosted product, needs written permission from the copyright holder.
