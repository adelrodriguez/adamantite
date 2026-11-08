// Reproduce the fixture expansion and repeated preset-reference changes for #647.
// Run `node scripts/merge-react-doctor.ts fixtures` or `... references` from the repository root.
import assert from "node:assert/strict"
import { existsSync, mkdirSync, readFileSync, renameSync, rmdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

const fixtures = {
  "debounce-no-cleanup": {
    invalid: {
      "component.tsx": `import { useEffect, useMemo } from "react"
import { debounce } from "lodash"

declare function fetchResults(query: string): Promise<unknown>

export function Search({ query }: { query: string }) {
  const search = useMemo(() => debounce(async (value: string) => {
    await fetchResults(value)
  }, 500), [])
  useEffect(() => { void search(query) }, [query, search])
  return null
}
`,
    },
    valid: {
      "component.tsx": `import { useEffect, useMemo } from "react"
import { debounce } from "lodash"

declare function fetchResults(query: string): Promise<unknown>

export function Search({ query }: { query: string }) {
  const search = useMemo(() => debounce(async (value: string) => {
    await fetchResults(value)
  }, 500), [])
  useEffect(() => {
    void search(query)
    return () => search.cancel()
  }, [query, search])
  return null
}
`,
    },
  },
  "effect-listener-cleanup-reference-mismatch": {
    invalid: {
      "useSubscription.ts": `import { useEffect } from "react"

declare const appEvent: { subscribe(handler: () => void): void; unsubscribe(handler: () => void): void }
declare function handle(): void

export function useSubscription() {
  useEffect(() => {
    appEvent.subscribe(() => { handle() })
    return () => { appEvent.unsubscribe(() => { handle() }) }
  }, [])
}
`,
    },
    valid: {
      "useSubscription.ts": `import { useEffect } from "react"

declare const appEvent: { subscribe(handler: () => void): void; unsubscribe(handler: () => void): void }
declare function handle(): void

export function useSubscription() {
  useEffect(() => {
    const handler = () => { handle() }
    appEvent.subscribe(handler)
    return () => { appEvent.unsubscribe(handler) }
  }, [])
}
`,
    },
  },
  "effect-needs-cleanup": {
    invalid: {
      "useTicker.ts": `import { useEffect } from "react"

declare function tick(): void

export function useTicker() {
  useEffect(() => { setInterval(tick, 1000) }, [])
}
`,
    },
    valid: {
      "useTicker.ts": `import { useEffect } from "react"

declare function tick(): void

export function useTicker() {
  useEffect(() => {
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [])
}
`,
    },
  },
  "no-create-context-in-render": {
    invalid: {
      "alias.tsx": `import { createContext as makeContext } from "react"

export function App() {
  const Context = makeContext(null)
  return <Context.Provider value={null}><p>App</p></Context.Provider>
}
`,
      "component.tsx": `import { createContext } from "react"

export function App() {
  const Context = createContext(null)
  return <Context.Provider value={null}><p>App</p></Context.Provider>
}
`,
      "namespace.tsx": `import * as React from "react"

export function App() {
  const Context = React.createContext(null)
  return <Context.Provider value={null}><p>App</p></Context.Provider>
}
`,
    },
    valid: {
      "module-scope.tsx": `import { createContext } from "react"

const Context = createContext(null)

export function App() {
  return <Context.Provider value={null}><p>App</p></Context.Provider>
}
`,
    },
  },
  "no-create-object-url-in-render": {
    invalid: {
      "component.tsx": `export function Preview({ data }: { data: Blob }) {
  const url = URL.createObjectURL(data)
  return <a href={url}>Download</a>
}
`,
      "memo.tsx": `import { useMemo } from "react"

export function Preview({ data }: { data: Blob }) {
  const url = useMemo(() => URL.createObjectURL(data), [data])
  return <a href={url}>Download</a>
}
`,
    },
    valid: {
      "event.tsx": `export function Download({ data }: { data: Blob }) {
  function download() {
    const url = URL.createObjectURL(data)
    URL.revokeObjectURL(url)
  }
  return <button onClick={download} type="button">Download</button>
}
`,
      "usePreview.ts": `import { useEffect } from "react"

export function usePreview(data: Blob) {
  useEffect(() => {
    const url = URL.createObjectURL(data)
    return () => URL.revokeObjectURL(url)
  }, [data])
}
`,
    },
  },
  "no-effect-wrapper-discards-callback-cleanup-return": {
    invalid: {
      "useOptionalEffect.ts": `import { useEffect } from "react"

export function useOptionalEffect(effect?: () => void | (() => void)) {
  useEffect(() => { effect?.() }, [effect])
}
`,
      "useWrappedEffect.ts": `import { useEffect, type EffectCallback } from "react"

export function useWrappedEffect(effect: EffectCallback) {
  useEffect(() => { effect() }, [effect])
}
`,
    },
    valid: {
      "useVoidEffect.ts": `import { useEffect } from "react"

export function useVoidEffect(effect: () => void) {
  useEffect(() => { effect() }, [effect])
}
`,
      "useWrappedEffect.ts": `import { useEffect, type EffectCallback } from "react"

export function useWrappedEffect(effect: EffectCallback) {
  useEffect(() => effect(), [effect])
}
`,
    },
  },
  "no-loading-flag-reset-outside-finally": {
    invalid: {
      "early-return.ts": `declare function setLoading(value: boolean): void
declare function loadPage(): Promise<boolean>

export async function load() {
  setLoading(true)
  if (!(await loadPage())) return
  setLoading(false)
}
`,
      "rejected-request.ts": `declare function setIsLoading(value: boolean): void
declare function loadPage(): Promise<unknown>

export async function load() {
  setIsLoading(true)
  await loadPage()
  setIsLoading(false)
}
`,
    },
    valid: {
      "finally.ts": `declare function setIsLoading(value: boolean): void
declare function loadPage(): Promise<unknown>

export async function load() {
  setIsLoading(true)
  try {
    await loadPage()
  } finally {
    setIsLoading(false)
  }
}
`,
      "handled-error.ts": `declare function setLoading(value: boolean): void
declare function setError(error: unknown): void
declare function loadPage(): Promise<unknown>

export async function load() {
  setLoading(true)
  try {
    await loadPage()
  } catch (error) {
    setError(error)
  }
  setLoading(false)
}
`,
    },
  },
  "no-stale-timer-ref": {
    invalid: {
      "useDelayedCallback.ts": `import { useRef } from "react"

export function useDelayedCallback(callback: () => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  function schedule() {
    if (timerRef.current) return
    timerRef.current = setTimeout(callback, 100)
  }
  function cancel() {
    if (timerRef.current) clearTimeout(timerRef.current)
  }
  return { cancel, schedule }
}
`,
    },
    valid: {
      "useDelayedCallback.ts": `import { useRef } from "react"

export function useDelayedCallback(callback: () => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  function schedule() {
    if (timerRef.current) return
    timerRef.current = setTimeout(callback, 100)
  }
  function cancel() {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
  }
  return { cancel, schedule }
}
`,
    },
  },
}

const root = join(import.meta.dirname, "..")
const mode = process.argv[2]

if (mode === "fixtures") {
  for (const [rule, kinds] of Object.entries(fixtures)) {
    for (const [kind, cases] of Object.entries<Record<string, string>>(kinds)) {
      for (const [name, content] of Object.entries(cases)) {
        const fixtureRule =
          rule === "effect-listener-cleanup-reference-mismatch" ? "effect-needs-cleanup" : rule
        const file = join(
          root,
          "src/__tests__/presets/fixtures/react-doctor",
          fixtureRule,
          kind,
          name
        )
        if (existsSync(file)) {
          // These two files are the hand-written first unit used to check this script.
          if (
            rule === "no-loading-flag-reset-outside-finally"
            && ["rejected-request.ts", "finally.ts"].includes(name)
          ) {
            assert.equal(readFileSync(file, "utf8"), content)
          }
          continue
        }
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, content)
        assert.equal(readFileSync(file, "utf8"), content)
      }
    }
  }
} else if (mode === "references") {
  const fixtureRoot = join(root, "src/__tests__/presets/fixtures/react-doctor")
  for (const [kind, cases] of Object.entries(
    fixtures["effect-listener-cleanup-reference-mismatch"]
  )) {
    for (const name of Object.keys(cases)) {
      const source = join(fixtureRoot, "effect-listener-cleanup-reference-mismatch", kind, name)
      if (!existsSync(source)) continue
      const target = join(fixtureRoot, "effect-needs-cleanup", kind, name)
      const content = readFileSync(source, "utf8")
      mkdirSync(dirname(target), { recursive: true })
      renameSync(source, target)
      assert.equal(readFileSync(target, "utf8"), content)
    }
    const directory = join(fixtureRoot, "effect-listener-cleanup-reference-mismatch", kind)
    if (existsSync(directory)) rmdirSync(directory)
  }
  const referenceDirectory = join(fixtureRoot, "effect-listener-cleanup-reference-mismatch")
  if (existsSync(referenceDirectory)) rmdirSync(referenceDirectory)
  const observer = join(fixtureRoot, "effect-observer-needs-disconnect.tsx")
  if (existsSync(observer)) {
    const content = readFileSync(observer, "utf8")
    const target = join(fixtureRoot, "effect-needs-cleanup/invalid/observer.tsx")
    renameSync(observer, target)
    assert.equal(readFileSync(target, "utf8"), content)
  }
  for (const file of [
    "src/commands/__tests__/init.test.ts",
    "src/commands/init/options.ts",
    "src/commands/init/prompts.ts",
    "src/lib/integrations/tooling/oxlint/plugins/react-doctor.ts",
  ]) {
    const path = join(root, file)
    const content = readFileSync(path, "utf8")
    const updated = content
      .replaceAll('"react-doctor"', '"react-strict"')
      .replaceAll("`react-doctor`", "`react-strict`")
      .replaceAll("--preset react-doctor", "--preset react-strict")
      .replaceAll("react-doctor without the react preset", "react-strict without the react preset")
      .replaceAll(
        "when the react-doctor preset is selected",
        "when the react-strict preset is selected"
      )
      .replaceAll("when react-doctor is selected", "when react-strict is selected")
      .replaceAll(
        'import reactDoctor from "adamantite/lint/react-doctor"',
        'import reactStrict from "adamantite/lint/react-strict"'
      )
    if (updated !== content) writeFileSync(path, updated)
  }
} else {
  throw new Error("Select fixtures or references")
}
