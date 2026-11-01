import { describe, expect, it } from "@effect/vitest"
import { assessPrepareScript } from "#lib/integrations/tooling/oxlint/plugins/effect-tsgo/prepare-script.ts"

const INTEGRATION = "@effect/tsgo"

describe("prepare-script", () => {
  describe("assessPrepareScript", () => {
    it.each(["adamantite prepare", "adamantite prepare && (husky)"])(
      "report the prepare script `%s`, which still runs adamantite prepare",
      (prepare) => {
        expect(assessPrepareScript({ scripts: { prepare } }, INTEGRATION)).toStrictEqual([
          expect.objectContaining({
            currentState: `The \`prepare\` script (\`${prepare}\`) still runs \`adamantite prepare\`, which does nothing.`,
            id: "legacy-adamantite-prepare",
            integration: INTEGRATION,
          }),
        ])
      }
    )

    it("report nothing for a prepare script without adamantite prepare, or no script", () => {
      expect(assessPrepareScript({ scripts: { prepare: "husky" } }, INTEGRATION)).toStrictEqual([])
      expect(assessPrepareScript({}, INTEGRATION)).toStrictEqual([])
    })
  })
})
