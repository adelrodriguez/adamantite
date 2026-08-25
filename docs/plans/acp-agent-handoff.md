# Plan: ACP agent handoff

## Goal

Let a person pass Doctor findings to Codex or Claude from an interactive Adamantite run
without encoding either provider's CLI prompt, permission, sandbox, trust, or
authentication flags. Use the stable Agent Client Protocol (ACP) v1 as the boundary.

Doctor must remain a read-only assessment command. The selected agent owns all target
project mutations. Doctor reassesses after the ACP session ends and remains the
convergence oracle.

## Current baseline

The direct `AgentRunner` integration was removed before this plan was created. Until ACP
handoff ships:

- Interactive Doctor renders every finding and offers to copy the combined Markdown
  prompt.
- A coding agent can run `adamantite doctor` itself and receive the Markdown prompt
  directly.
- Non-interactive Doctor prints only the Markdown prompt and exits 1 while findings
  remain.
- `update` reports findings and points to Doctor. It does not start an agent.

This baseline is the fallback behavior for every ACP failure.

## Evidence and protocol choice

ACP is designed for a client application to start and control a coding agent over
JSON-RPC. Local agents use newline-delimited JSON over stdin and stdout. The protocol
includes session creation, prompts, streamed updates, permission requests, cancellation,
and authentication.

Use these versioned sources during implementation:

- [ACP introduction](https://agentclientprotocol.com/get-started/introduction)
- [ACP architecture](https://agentclientprotocol.com/get-started/architecture)
- [Official TypeScript SDK](https://github.com/agentclientprotocol/typescript-sdk)
- [ACP registry](https://agentclientprotocol.com/get-started/registry)
- [Claude ACP adapter](https://github.com/agentclientprotocol/claude-agent-acp)
- [Codex ACP adapter](https://github.com/agentclientprotocol/codex-acp)

Use stable ACP v1. Do not import the experimental v2 entry point.

Before implementation, run Packref for the exact selected releases of:

- `@agentclientprotocol/sdk`
- `@agentclientprotocol/claude-agent-acp`
- `@agentclientprotocol/codex-acp`

Read their source and lock their references. Do not copy API shapes from `main` or rely on
unversioned registry data.

## Caller usage

### Normal handoff

Doctor owns the interaction and passes normalized callbacks to the agent client:

```ts
const agents = yield * CodingAgents
const availableAgents = yield * agents.available()
const agent = yield * chooseAgent(availableAgents)

const result =
  yield *
  agents.run({
    agent,
    cwd,
    prompt: renderFindingsPrompt(findings, version),
    onPermission: requestPermission,
    onProgress: renderAgentProgress,
  })

const remainingFindings = yield * collectCurrentFindings()
```

`doctor.ts` knows the selected agent, repair prompt, progress text, and user decisions. It
does not know an adapter package name, process argument, ACP method name, or JSON shape.

### Permission request

The ACP layer converts the protocol request into a small Adamantite type. The command
shows the agent-provided choices and returns the selected stable option ID:

```ts
const requestPermission = (request: AgentPermissionRequest) =>
  prompter.select({
    message: request.title,
    options: request.options.map((option) => ({
      label: option.label,
      value: option.id,
    })),
  })
```

Adamantite must not translate a general user choice such as "Pass to Codex" into blanket
approval. Each permission request stays visible unless the agent itself offers and the
user selects a persistent permission option.

### Failure

If an adapter cannot start, authenticate, initialize, or complete its session, Doctor
reports a short error and keeps the copy-prompt action available. Doctor then exits 1
because the original findings remain. It does not retry with another agent automatically.

### Non-interactive composition

No ACP service is resolved in a non-interactive run:

```sh
adamantite doctor
```

The calling agent receives the existing Markdown prompt. This path must not depend on an
ACP adapter, network connection, authentication state, or terminal capability.

## Domain shape

Keep ACP types at the protocol boundary. Commands use these normalized types:

```ts
type CodingAgentId = "claude" | "codex"

interface CodingAgent {
  readonly id: CodingAgentId
  readonly name: string
  readonly requiresDownload: boolean
}

interface AgentPermissionOption {
  readonly id: string
  readonly kind: "allow-once" | "allow-always" | "reject-once" | "reject-always" | "other"
  readonly label: string
}

interface AgentPermissionRequest {
  readonly options: readonly AgentPermissionOption[]
  readonly title: string
}

type AgentProgress =
  | { readonly kind: "message"; readonly text: string }
  | { readonly kind: "plan"; readonly text: string }
  | {
      readonly kind: "tool"
      readonly status: "pending" | "running" | "completed" | "failed"
      readonly title: string
    }

interface AgentRunResult {
  readonly stopReason: string
}

interface AgentRunInput {
  readonly agent: CodingAgent
  readonly cwd: string
  readonly onPermission: (
    request: AgentPermissionRequest
  ) => Effect.Effect<string, OperationCancelled>
  readonly onProgress: (progress: AgentProgress) => Effect.Effect<void>
  readonly prompt: string
}
```

The precise permission and stop-reason unions must be derived from the locked ACP SDK.
ACP uses extensible unions, so unknown protocol values must map to `"other"` or remain a
validated string. Do not cast them into a closed union.

The service interface is intentionally small:

```ts
interface CodingAgentsService {
  readonly available: () => Effect.Effect<readonly CodingAgent[], AgentDiscoveryError>
  readonly run: (
    input: AgentRunInput
  ) => Effect.Effect<AgentRunResult, AgentHandoffError | OperationCancelled>
}
```

There is no public `getCommand`, raw process runner, ACP connection, or adapter definition.

## Module ownership

Add `src/lib/agent/` as a module seam:

```text
src/lib/agent/
  coding-agents.ts       Effect service and normalized public model
  acp-client.ts          stable ACP v1 session lifecycle
  acp-model.ts           ACP-to-domain normalization
  adapter-catalog.ts     private, pinned Claude and Codex distributions
  errors.ts              tagged discovery, launch, protocol, auth, and session errors
  __tests__/
```

Dependency direction:

```text
commands/doctor.ts
  -> lib/agent/coding-agents.ts
     -> lib/agent/acp-client.ts
        -> @agentclientprotocol/sdk
        -> child-process transport
```

`src/lib/agent/` must not import `#terminal/*`. The command maps normalized progress and
permission requests to Clack output. Findings and their Markdown renderer remain in
`src/lib/shared`; ACP has no ownership of assessment data.

Update `docs/architecture.md` with the new `agent` module only when the implementation
lands.

## Adapter distribution

Support only the registry IDs `claude-acp` and `codex-acp` in the first release. Keep a
private catalog with an exact package version, expected executable, display name, and
registry ID. Do not fetch the live ACP registry at runtime and do not accept arbitrary
commands from project configuration.

Resolution order:

1. Prefer the corresponding ACP adapter executable when it is already on `PATH`.
2. Otherwise, if Node and `npx` are available, mark the agent as requiring a download.
3. Before the first download, show the exact pinned package and ask for confirmation.
4. Run the exact pinned registry package through `npx`; never use `latest`.
5. If neither path is available, omit the agent and keep the copy-prompt fallback.

The implementation spike must verify that both adapters can use the user's existing
provider authentication. If either adapter requires Adamantite to receive or store an API
key, do not ship that adapter until ACP authentication can keep the credential inside the
adapter.

Adamantite supports Bun-only target environments. ACP handoff can require Node 22 because
the current adapter packages require Node. Doctor assessment and prompt copy must continue
to work when Node or `npx` is absent.

## ACP session lifecycle

The production service owns one adapter process and one ACP session per `run` call:

1. Resolve the pinned adapter distribution.
2. Acquire the child process with stdin and stdout piped and stderr captured separately.
3. Convert the byte streams with the stable SDK's NDJSON stream helper.
4. Initialize ACP v1 with Adamantite client metadata and the smallest capability set.
5. Complete ACP authentication if the adapter reports that it is required.
6. Create a session with an absolute target-project path and no extra directories.
7. Send the complete Markdown repair prompt as one text prompt.
8. Normalize session notifications and call `onProgress` in their original order.
9. Normalize permission requests, call `onPermission`, and return the exact selected
   option ID to the adapter.
10. Wait for the protocol stop response.
11. Close the session when supported, close the stream, and terminate the adapter process.
12. Return the normalized stop reason. Doctor then reassesses once.

Use `Effect.acquireUseRelease` for the connection and process lifetime. Interruption must
cancel the ACP session, close its streams, and reap the child process. Do not leave an
unobserved Promise or detached receive loop.

Do not advertise client filesystem or terminal capabilities in the first version unless a
locked adapter requires them. The adapter already owns its workspace tools. Every added
client capability expands Adamantite's security and test scope and needs a separate
design decision.

## Doctor flow

The completed interactive flow is:

1. Assess and render all findings.
2. Select `Pass to a coding agent` or `Copy the Markdown prompt`.
3. For copy, use the existing clipboard path and exit 1.
4. For handoff, list the supported ACP agents and select one.
5. If the adapter needs a download, show its exact package and confirm.
6. Check whether the working tree is clean. Warn and require confirmation when cleanliness
   cannot be confirmed, including a directory that is not a Git repository.
7. Start the ACP session and render progress and permission requests.
8. Reassess once after any terminal ACP stop reason.
9. Exit 0 only when all findings are gone. Otherwise render the surviving findings and
   exit 1.

`update` stays outside this flow. It continues to update managed dependencies, report
findings, and point to Doctor.

## Error boundaries

Use tagged errors that preserve the agent ID and safe context:

- `AgentDiscoveryError`: local adapter and launcher discovery failed.
- `AgentDownloadDeclined`: the user did not authorize the pinned adapter download.
- `AgentLaunchError`: the adapter process could not start.
- `AgentAuthenticationError`: ACP authentication did not complete.
- `AgentProtocolError`: initialization, validation, stream, or session protocol failed.
- `AgentExitedError`: the adapter exited before a protocol stop response.

Do not include the repair prompt, credentials, environment variables, or raw protocol
payloads in user-facing errors. Debug logging can include method names, agent ID, adapter
version, and session ID.

## Safety invariants

- Doctor performs no file write before or after the agent session.
- The Markdown prompt never appears in process arguments, command logs, or errors.
- Adamantite never creates provider permission rules or selects a permission option for
  the user.
- The ACP session receives only the target-project directory. No extra writable directory
  is added.
- Adapter packages and the SDK use exact reviewed versions.
- Runtime adapter download always requires an explicit confirmation.
- Non-interactive runs never download or start an adapter.
- A dirty or unknown Git state requires confirmation before handoff.
- Doctor's reassessment, not the adapter process exit code, decides success.

## Testing strategy

### Pure model tests

Test every ACP update, permission option, stop reason, and unknown extensible value against
the normalized domain types. These tests import locked SDK types but start no process.

### In-memory protocol tests

Use the SDK's in-memory stream support, or a small pair of Web Streams if the locked SDK
does not export one. Run a fake ACP agent that verifies:

- initialization uses stable ACP v1;
- the session gets the absolute target-project path;
- the Markdown prompt arrives once and is byte-for-byte equal;
- progress updates keep their order;
- permission option IDs make a round trip without translation;
- normal stop, early process exit, malformed JSON, protocol mismatch, authentication
  failure, cancellation, and stream failure release all resources.

These unit tests must not touch the host filesystem.

### Command tests

Provide a fake `CodingAgents` layer and the existing in-memory filesystem. Cover:

- copy prompt without resolving the ACP service;
- no available agent;
- declined adapter download;
- dirty or unknown Git state declined and accepted;
- permission selection and cancellation;
- full repair followed by successful reassessment;
- partial repair followed by surviving findings and exit 1;
- agent failure followed by copy-prompt fallback;
- non-interactive Markdown output with no agent discovery.

### Process integration test

Add one test-only ACP agent fixture that runs as a real child process and speaks NDJSON.
This is an integration test, not a unit test. It proves stream wiring, interruption, and
process cleanup without contacting a model or writing to the host project.

### Manual adapter smoke test

Use a disposable target project with a clean Git repository. Run each pinned adapter and
verify authentication, permission prompts, file edits, Doctor reassessment, cancellation,
and adapter cleanup. Do not run a paid model in automated CI.

Run the repository verification commands after each implementation unit:

```sh
pnpm run test
pnpm run check
pnpm run fix
pnpm run format
pnpm run analyze
pnpm run test:build
```

## Implementation sequence

### 1. Dependency and authentication spike

- Add exact Packref references for the stable SDK and both adapters.
- Verify stable v1 client construction, authentication, permissions, session close,
  cancellation, and adapter exit behavior from source.
- Measure installed size and startup time for PATH and pinned `npx` launch paths.
- Verify existing Codex and Claude credentials stay inside their adapters.
- Verify Node, Bun, macOS, Linux, and Windows launch constraints.
- Record the results in this plan. Stop if a credential or permission invariant cannot be
  met.

### 2. Establish domain types and service contract

- Add the normalized types and tagged errors.
- Add the `CodingAgents` service interface.
- Write command caller tests against a fake layer before the ACP implementation.
- Update the architecture document with the new module seam.

### 3. Implement ACP normalization

- Map stable v1 updates, permission requests, authentication states, and stop reasons.
- Preserve unknown values safely.
- Add exhaustive pure tests.

### 4. Implement connection lifetime

- Add the child-process transport and SDK connection.
- Implement initialize, authenticate, session creation, prompt, progress, permissions,
  stop, cancellation, and cleanup.
- Prove it with the in-memory fake agent and process integration fixture.

### 5. Implement pinned adapter discovery

- Add the two private adapter definitions.
- Prefer PATH executables and fall back to confirmed, exact `npx` packages.
- Add offline, missing-Node, declined-download, and early-exit tests.
- Run `pnpm run analyze` because this step changes dependencies and imports.

### 6. Wire Doctor

- Restore the two top-level actions and the Codex/Claude selection.
- Add download, Git-state, permission, cancellation, and progress interactions.
- Reassess once after the session stops.
- Keep non-interactive output unchanged and keep `update` out of the handoff flow.

### 7. Document and release

- Update README, the Adamantite skill, architecture, and ADR 0002.
- Add a Changeset entry for direct ACP handoff.
- Document the exact adapter packages, Node requirement, authentication behavior,
  clipboard fallback, and how to cancel a session.
- Complete the manual smoke-test matrix.
- Delete this plan after all acceptance criteria pass.

## Alternatives considered

### Keep direct provider CLI adapters

Rejected. Passing prompts through arguments and selecting provider permission flags made
Doctor depend on unstable syntax and local trust policy. Stdin fixes only prompt parsing;
it does not fix permission, sandbox, authentication, or repository-trust differences.

### Use provider SDKs directly

Rejected. Adamantite would own two agent loops, authentication systems, tool APIs,
permission models, and billing paths. Adding another agent would require another complete
integration.

### Keep prompt-only handoff permanently

This remains the fallback and is the smallest reliable design. It loses the requested
one-action handoff, progress, and permission UX. Use it if the dependency spike shows that
ACP cannot meet the safety invariants.

### Fetch and trust the live ACP registry

Rejected for the first release. Runtime registry changes would make behavior
non-reproducible and expand the supported-agent and supply-chain scope. A later release
can add registry discovery after the two pinned adapters are stable.

## Tradeoffs accepted

- We accept a new protocol dependency in exchange for removing provider CLI policy from
  Adamantite.
- We accept support for only Codex and Claude at first in exchange for a small test matrix.
- We accept an explicit first-download confirmation in exchange for keeping adapter code
  out of Adamantite's normal install size.
- We accept a Node requirement for direct handoff in exchange for using the supported
  adapter runtimes; prompt-only Doctor still supports the existing runtimes.
- We accept protocol event normalization in exchange for keeping ACP types and churn out
  of command modules.

## Acceptance criteria

- An interactive user can select Codex or Claude and send all findings through ACP.
- No provider-specific prompt, permission, sandbox, trust, or authentication flag exists
  in Adamantite source.
- The repair prompt is not present in process arguments or command logs.
- Permission requests require a user decision and return the exact ACP option ID.
- Cancellation closes the ACP session and child process.
- Doctor reassesses once and exits according to the remaining findings.
- Non-interactive Doctor output is byte-for-byte unchanged from the prompt-only baseline.
- Missing runtime, offline download, adapter failure, and authentication failure keep the
  copy-prompt fallback usable.
- Unit tests use the in-memory filesystem and do not start real provider agents.
- The full repository verification suite and both manual adapter smoke tests pass.

## Open risks

- The adapter packages may not reuse existing provider authentication on every platform.
- ACP authentication may require browser or terminal interaction that Clack must yield to.
- Adapter packages can have a large download and cold-start cost.
- The current adapters require Node even when Adamantite runs under Bun.
- ACP extensible unions can add update and permission variants between reviewed releases.
- Windows process interruption and cleanup can differ from POSIX behavior.

The dependency spike must resolve the first four risks before product wiring begins.
