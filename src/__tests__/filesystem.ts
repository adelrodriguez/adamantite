import { access, mkdir, readFile, writeFile as writeNodeFile } from "node:fs/promises"
import { dirname } from "node:path"

export async function writeFile(path: string, data: string | Uint8Array) {
  await mkdir(dirname(path), { recursive: true })
  await writeNodeFile(path, data)
}

export function testFile(path: string) {
  return {
    exists: async () => {
      try {
        await access(path)
        return true
      } catch {
        return false
      }
    },
    text: () => readFile(path, "utf8"),
  }
}
