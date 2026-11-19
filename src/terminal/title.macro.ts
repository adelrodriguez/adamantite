import figlet from "figlet"

export function getTitle() {
  return figlet.textSync("adamantite", { font: "Roman" })
}
