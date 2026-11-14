import { readFile } from "node:fs/promises"
import { join } from "node:path"

export async function readConfig(directory: string) {
  try {
    return await readFile(join(directory, "config.json"), "utf8")
  } catch (error) {
    throw new Error("Cannot read config", { cause: error })
  }
}
