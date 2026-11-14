import process from "node:process"
import { parseArgs } from "node:util"

const { values } = parseArgs({ options: { port: { type: "string" } } })
const port = Number(values.port ?? process.env["PORT"] ?? "3000")

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new RangeError("Invalid port")
}

console.info(`Listening on ${port}`)
