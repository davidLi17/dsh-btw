# v1.2.0 implementation and verification

## Baselines and inspected sources

- LHG Utils implementation starts at `davidLi17/dsh-btw` main `bc915649b4bdab6529f19fe59a735050ac134965` (v1.1.3), fetched before editing.
- DSH official source: `deepseek-ai/DeepSeek-Harness` commit `687f282e8625c6b8d11ff58211a90524be2e4317`. Checked `packages/client/ui-model-selection/src/client/{directory,service}.ts`, `packages/client/shortcuts/src/client/{index,types,dom}.ts`, the composer contenteditable/keymap, native configuration transport, and the model-selection RPC. Public types/builds were also checked against npm `0.2.1-rc.2` rather than assuming main equals a release.
- Installed Codex reference: `WSL043/dsh-codex-subscription` tag `v3.1.3`, commit `2c7d9abc75eb104f614d1b9cad749de048614cf6`. Checked `src/model-catalog.js` and `src/client-model-select.jsx`: reasoning belongs to the shared directory, while speed/verbosity use a separate preference store. No subscription source, OAuth credentials, or account requests are used by this plugin.
- Inspected `HanaAyane/dsh-reasoning-effort` commit `40dc249bebe0c2223376c6f8cd1842d9259748b8`, especially `src/client/effort-selection.ts`, and `domitor-syh/dsh-ui-skin-switcher` commit `5ec59ecb76c816bddb71ae5f509f9549dfdf7b43`, `src/client/index.ts`, for public selection/error semantics. New shortcut/controller implementation uses the official public interfaces; these references do not redefine host capabilities.

## Important API limitation

The native `ModelDirectory.select` calls `session.selectModel`. The host then calls `agentDefaultModel.saveSelection(selected)`. When its configuration editor is available, this saves provider/model/effort as the default for future sessions. There is no public session-only/no-save flag in this API. The plugin preserves the focused session's provider/model and does not write Codex speed/verbosity/authentication, but cannot promise unchanged global defaults. The requested native default-memory behavior was explicitly accepted during implementation. No compensating default write or private host monkey-patch is performed.

Already-submitted selection RPCs have no public cancellation parameter. Disabling the module, focus/reset events, a changed selection, or a timeout releases local subscriptions and drops queued submissions; it cannot retract a request already accepted by the host.

## Automated checks

- `npm ci` with a writable npm cache: passed.
- `npm run check`: TypeScript, 158 Vitest tests (26 files), 17 annotation tests, 11 release tests and build passed. New tests are collected by the existing aggregate `npm test` step.
- `npm run test:compat -- 0.2.1-rc.1 0.2.1-rc.2`: both passed in independent dependency trees, each with 72 version-aligned host packages. The test runner now copies real locale metadata and preserves package metadata in the isolated manifest.
- `npm pack --ignore-scripts` plus the package-content gate: passed (46 files). The gate now permits and requires the third-party ANNOTATIONS-LICENSE and VOICE-LICENSE instead of incorrectly rejecting it; a regression test also verifies missing licenses and secret files are rejected.
- Older `0.2.0-rc.1` / `0.2.0-rc.2` probing failed: the retained v1.1.3 side-delivery implementation requires `appendPluginRecord` / `pluginRecordOf`, absent in those releases; old fork continuation also differs. These releases are not claimed supported. Peer version gates and the default compatibility matrix now match the verified `0.2.1` release candidates.
- The reproducible native DOM integration test loads the actual installed ShortcutsService with Lexical 0.49.0/plain-text and host composition guard. It confirms Shift+Up/Down, unchanged draft/focus/caret, prior local menu consumption, portal menu exclusion, IME/modifier exclusion and disposal. Directory/RPC and local menu ownership are fixtures; this is not a full installed DSH UI.
- Existing cold-session side-delivery, ordinary subagent routing, tools, annotations and save-focus regressions remain in the suite; source implementations/storage identities were preserved.

## Actual application acceptance still required

A full installed DSH Desktop run and an installed DSH Web run were not performed. Cloud Chromium startup was blocked by this execution environment's socket/sandbox restrictions; an escalation attempt failed before browser launch. DOM integration tests do not establish browser-native selection, real operating-system IME behavior, installation/upgrade, account-specific dynamic catalogs, or native Desktop interception.

Before final release acceptance, test real Desktop and Web with the supported host: Shift+Up/Down and boundaries, held/rapid keys, default/no-default/unsupported efforts, switching sessions/models during pending RPC, menu and IME ownership, draft/focus/caret preservation, module disable/re-enable/unload, saved annotations and quote navigation, fresh BTW notification isolation after resume, Codex Fast/Ultrafast and verbosity preservation, and installation via the renamed repository without duplicate instances.

## Optional side-question speech verification

- Reused official MIT capture code from DeepSeek `dsh-v0.2.1-rc.2`, commit `687f282e8625c6b8d11ff58211a90524be2e4317`; only TypeScript typed-array annotations and the ES2023-compatible promise resolver changed. No new dependency or private slot override.
- Eleven added tests cover draft selection/caret/focus, no main-composer changes or auto-send, conflict preservation, service absence/unload, native setup guidance, cancellation/late results, pending permission release, session changes, Enter/send guards, public Cordis service binding and actual WAV encoding with simulated media grants.
- Final `npm run check` passed: 158 Vitest tests, 17 annotation tests, 11 release tests, typecheck and rebuilt lib. Bundled-client Cordis injection tests also passed (2 tests). Package content gate passed with all three license files (46 files).
- `npm pack` initially could not create the default `/home/agent/.npm` cache; rerunning with an explicit writable temporary cache succeeded. No dependency installation occurred.
- No real microphone was accessed, no model/runtime was downloaded and no live transcription was attempted. Real browser/device permission, Host SenseVoice preparation/transcription and Desktop/Web UI acceptance remain user-run checks. The voice RPC contract is verified for rc.2; the previous full compatibility matrix results above predate this optional addition.

## 1.2.1 annotation upstream integration (2026-10-23)

- Selected upstream annotations fixes through `ce3866ab877de7f402f1ee121ed858cd4871c3e7`: optimistic submission projection (with old-host fallback), reply citation hover/click navigation and durable-history number reservation. The old BTW QuoteDock path was not reintroduced.
- The upstream unconditional 354-character system-prompt section was not registered. A 117-character citation instruction is appended only to each model-facing user text block containing valid annotation payloads, once per block even if it contains multiple payloads. Ordinary user/assistant/tool messages receive no addition. Existing annotation-bearing history retains its instruction on future reads; original messages and persistence are not rewritten, so repeat projection does not accumulate copies. This measures UTF-16 characters, not tokens.
- `npm run check` passed: typecheck, 162 Vitest tests (27 files), 22 annotation tests, 11 release tests and build. New DOM coverage checks citation preview and click navigation without main-draft changes/BTW execution; runtime coverage checks unchanged serialization/request metadata, old-host absence, historical numbering and disposal restoration.
- `npm pack --ignore-scripts` and `scripts/check-package.mjs` passed, 47 files including rebuilt entry points, declarations and original license notices. No runtime dependency, peer gate or prepare script changed.
- Remote base before implementation was `83c20c23b3bde6f56476026b2760e605b7d77ee1`; there were no open pull requests and no Actions runs. No real DSH Desktop/Web UI, live model reply or microphone check was performed for this patch. The previous host-version compatibility matrix was not rerun in this patch.

## 1.2.3 recap command (2026-10-24)

- Fetched main `d38f44cd8c5fcfa955f5dbc8077c29f8f9c79158` before editing. Checked the installed DSH `0.2.1-rc.2` client command and conversation contracts and official tag `dsh-v0.2.1-rc.2` source.
- Registers a client-owned native slash action with `commandUi.register`, then fills the two-line prompt and calls the session input's native `submit`. The first microtask leaves Lexical's key update; a one-shot state subscription waits for bare-Enter adjudication to unlock. Typing and Space do not send, and native bare-token matching excludes longer text. No server prompt, key listener, private command override, or new runtime dependency.
- Passed typecheck and six focused tests: four recap tests execute installed host command dispatch/adjudication against an input fixture; two existing client-injection tests cover plugin activation and BTW. Built the precompiled client and declarations; package-content validation passed. This focused verification is not a full regression matrix or real Desktop/Web acceptance; no live AI message was sent.
