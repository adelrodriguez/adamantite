export const jsPlugins = {
  tailwind: {
    name: "eslint-plugin-better-tailwindcss",
    version: "3.8.0",
  },
} as const

export type JsPlugin = keyof typeof jsPlugins

export const getPluginDependencies = (presets: string[]) =>
  presets
    .filter((preset): preset is JsPlugin => preset in jsPlugins)
    .map((preset) => jsPlugins[preset])
