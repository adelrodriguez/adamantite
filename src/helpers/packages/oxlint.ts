import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Fault } from "faultier"
import { err, fromPromise, ok, safeTry } from "neverthrow"
import { checkIfExists, isJsonObject, mergeConfig, parseJson } from "#utils.ts"

export const oxlint = {
  config: {
    // Ensures that the schema always matches the installed version of oxlint
    $schema: "./node_modules/oxlint/configuration_schema.json",
  },
  create: (presets: string[] = []) => {
    const extendsArray = ["./node_modules/adamantite/presets/lint/core.json"]
    for (const preset of presets) {
      extendsArray.push(`./node_modules/adamantite/presets/lint/${preset}.json`)
    }

    return fromPromise(
      writeFile(
        join(process.cwd(), ".oxlintrc.json"),
        JSON.stringify({ ...oxlint.config, extends: extendsArray }, null, 2)
      ),
      (error) =>
        Fault.wrap(error)
          .withTag("FAILED_TO_WRITE_FILE")
          .withDescription(
            "Failed to write oxlint configuration",
            "We're unable to write the oxlint configuration to the current directory."
          )
    )
  },
  exists: async () => {
    if (await checkIfExists(join(process.cwd(), ".oxlintrc.json"))) {
      return { path: join(process.cwd(), ".oxlintrc.json") }
    }

    return { path: null }
  },
  name: "oxlint",
  update: (presets: string[] = []) =>
    safeTry(async function* () {
      const exists = await oxlint.exists()

      if (!exists.path) {
        return err(
          Fault.create("FILE_NOT_FOUND").withDescription(
            "No `.oxlintrc.json` found",
            "We're unable to find an oxlint configuration in the current directory."
          )
        )
      }

      const oxlintFile = yield* fromPromise(readFile(exists.path, "utf8"), (error) =>
        Fault.wrap(error)
          .withTag("FAILED_TO_READ_FILE")
          .withDescription(
            "Failed to read oxlint configuration",
            "We're unable to read the oxlint configuration from the current directory."
          )
      )

      const existingConfig = yield* parseJson(oxlintFile)

      // Empty configs are allowed and will be merged with Adamantite's config
      // Ensure existingConfig is a JSON object (not null, array, or primitive)
      if (!isJsonObject(existingConfig)) {
        return err(
          Fault.create("INVALID_CONFIG_FORMAT").withDescription(
            "Invalid oxlint configuration format",
            "The oxlint configuration must be a JSON object."
          )
        )
      }

      const newConfig: Record<string, unknown> = { ...existingConfig }

      const extendsArray: string[] = Array.isArray(newConfig.extends)
        ? newConfig.extends
        : typeof newConfig.extends === "string"
          ? [newConfig.extends]
          : []

      // Ensure core preset is always present
      const corePath = "./node_modules/adamantite/presets/lint/core.json"
      if (!extendsArray.includes(corePath)) {
        extendsArray.unshift(corePath)
      }

      // Add selected presets, avoiding duplicates
      for (const preset of presets) {
        const presetPath = `./node_modules/adamantite/presets/lint/${preset}.json`
        if (!extendsArray.includes(presetPath)) {
          extendsArray.push(presetPath)
        }
      }

      newConfig.extends = extendsArray

      const mergedConfig = yield* mergeConfig(newConfig, oxlint.config)
      mergedConfig.$schema = oxlint.config.$schema

      yield* fromPromise(writeFile(exists.path, JSON.stringify(mergedConfig, null, 2)), (error) =>
        Fault.wrap(error)
          .withTag("FAILED_TO_WRITE_FILE")
          .withDescription(
            "Failed to write oxlint configuration",
            "We're unable to write the oxlint configuration to the current directory."
          )
          .withContext({ path: exists.path })
      )

      return ok()
    }),
  version: "1.38.0",
}

export const tsgolint = {
  name: "oxlint-tsgolint",
  version: "0.10.1",
}
