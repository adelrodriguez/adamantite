import type { OxlintConfig } from "oxlint"

// React Doctor (https://github.com/millionco/react-doctor) reports specific misuse of React state
// and effects: state copied from props, effects that do the work of an event handler, data fetched
// in an effect, and state changed in place. Use it together with the react preset.
//
// oxlint-plugin-react-doctor is a managed plugin: it stays an npm package that the target project
// installs. `adamantite init` installs the pinned version when this preset is selected, and doctor
// and update keep it on that version. The bare specifier makes Oxlint resolve the package from the
// target project.
//
// The plugin exports more than 900 rules. This preset enables only per-file rules that the native
// react, react-hooks, jsx-a11y, and unicorn rules do not already report. See ADR 0005 for the
// criteria. Some of the rules skip test files and fixtures by path, such as `__tests__/` and
// `*.test.tsx`.
const config: OxlintConfig = {
  jsPlugins: ["oxlint-plugin-react-doctor"],
  rules: {
    // State: compute values while rendering and keep state changes pure.
    "react-doctor/no-create-store-in-render": "error",
    "react-doctor/no-derived-useState": "error",
    "react-doctor/no-direct-state-mutation": "error",
    "react-doctor/no-eager-new-in-use-state-initializer": "error",
    "react-doctor/no-impure-state-updater": "error",
    "react-doctor/no-mutating-reducer-state": "error",

    // Effects: run event logic in handlers, fetch data outside effects, and clean up.
    "react-doctor/effect-observer-needs-disconnect": "error",
    "react-doctor/effect-raf-loop-needs-cancel": "error",
    "react-doctor/no-effect-event-handler": "error",
    "react-doctor/no-event-trigger-state": "error",
    "react-doctor/no-fetch-in-effect": "error",
    "react-doctor/no-pass-live-state-to-parent": "error",
    "react-doctor/no-set-state-after-await-in-effect": "error",
  },
}

export default config
