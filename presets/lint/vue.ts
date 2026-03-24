import type { OxlintConfig } from "oxlint"

export default {
  plugins: ["vue"],
  rules: {
    "vue/define-emits-declaration": "error",
    "vue/define-props-declaration": "error",
    "vue/define-props-destructuring": "error",
    "vue/max-props": "error",
    "vue/no-arrow-functions-in-watch": "error",
    "vue/no-deprecated-destroyed-lifecycle": "error",
    "vue/no-export-in-script-setup": "error",
    "vue/no-import-compiler-macros": "error",
    "vue/no-lifecycle-after-await": "error",
    "vue/no-multiple-slot-args": "error",
    "vue/no-required-prop-with-default": "error",
    "vue/prefer-import-from-vue": "error",
    "vue/require-default-export": "error",
    "vue/require-typed-ref": "error",
    "vue/valid-define-emits": "error",
    "vue/valid-define-props": "error",
  },
} as const satisfies OxlintConfig
