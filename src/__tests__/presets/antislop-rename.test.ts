import { execFileSync } from "node:child_process"
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import process from "node:process"
import { describe, expect, it } from "@effect/vitest"

const REPO = join(import.meta.dirname, "../../..")

describe("antislop rename codemod", () => {
  it("remove empty old folders and preserve untracked files and license text", () => {
    const root = mkdtempSync(join(tmpdir(), "adamantite-rename-"))
    const old = "fixtures/strict/anti-slop/no-runtime-typeof/valid/a.ts"
    const license = "presets/lint/plugins/anti-slop/license.md"
    const notice = "# anti-slop license\nhttps://github.com/dmmulroy/anti-slop\n"

    try {
      mkdirSync(join(root, "scripts"), { recursive: true })
      cpSync(join(REPO, "scripts/rename-antislop.ts"), join(root, "scripts/rename-antislop.ts"))
      mkdirSync(join(root, "fixtures/strict/anti-slop/no-runtime-typeof/valid"), {
        recursive: true,
      })
      mkdirSync(join(root, "presets/lint/plugins/anti-slop"), { recursive: true })
      writeFileSync(join(root, old), 'export const rule = "anti-slop/no-runtime-typeof"\n')
      writeFileSync(join(root, license), notice)
      execFileSync("git", ["init", "--quiet"], { cwd: root })
      execFileSync("git", ["add", "."], { cwd: root })
      writeFileSync(join(root, "presets/lint/plugins/anti-slop/local.txt"), "keep this file")
      execFileSync(process.execPath, ["scripts/rename-antislop.ts", "--write"], { cwd: root })

      expect(existsSync(join(root, "fixtures/strict/anti-slop"))).toBe(false)
      expect(readFileSync(join(root, old.replaceAll("anti-slop", "antislop")), "utf8")).toContain(
        '"antislop/no-runtime-typeof"'
      )
      expect(readFileSync(join(root, license.replaceAll("anti-slop", "antislop")), "utf8")).toBe(
        notice
      )
      expect(readFileSync(join(root, "presets/lint/plugins/anti-slop/local.txt"), "utf8")).toBe(
        "keep this file"
      )
      expect(
        execFileSync(process.execPath, ["scripts/rename-antislop.ts", "--write"], {
          cwd: root,
          encoding: "utf8",
        })
      ).toBe("")
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })
})
