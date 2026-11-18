import figlet from "figlet"

/**
 * Build-time macro that renders the wordmark, so the bundle holds the text and not Figlet.
 */
export function getTitle() {
  return figlet.textSync("adamantite", { font: "Roman" })
}
