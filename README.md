# DSH-LHG-Utils (v1.2.0)

[简体中文](README.zh-CN.md)

**LHG Utils** is a modular DeepSeek Harness toolbox: BTW side questions, Codex-style text annotations, and native reasoning-effort shortcuts.

## Install or upgrade

Repository: [davidLi17/dsh-lhg-utils](https://github.com/davidLi17/dsh-lhg-utils)

GitHub installation address: `github:davidLi17/dsh-lhg-utils#main`

- Update the existing installation rather than installing both the old and new repository addresses. The npm identity `@michengai/dsh-btw`, Cordis component ID `michengai-btw`, and `/btw` command are unchanged for upgrade compatibility.
- Disable the standalone `dsh-codex-annotations` plugin before using the integrated annotations module to avoid duplicate toolbars and handling.
- Existing annotation storage keys and protocols are unchanged. Data remains available in the same client, site, and session; do not clear site storage. Cross-client migration is not automatic.
- Repository rename and installation/upgrade verification are release checks, not implied by the updated address in this document.

Supported hosts: DSH `0.2.1-rc.1` and `0.2.1-rc.2`. Earlier `0.2.0` hosts lack the durable plugin-record APIs required by the retained v1.1.3 BTW notification isolation. Upgrade DSH before installing v1.2.0; saved annotations and plugin identity remain unchanged.

## Modules

All three modules are enabled by default and can be switched independently. Open the native plugin settings for **LHG Utils** to use **BTW**, **Annotations**, and **Reasoning Shortcuts** toggles. The configuration keys are `btw`, `annotations`, and `reasoningShortcuts` under the retained `michengai-btw` component; no separate custom panel is required. Disabling a module releases its registrations; disabling annotations does not erase saved annotations. Missing native shortcut/model-directory services do not prevent BTW or annotations from running.

### BTW side questions

Select assistant text and choose **Side Ask**, or use `/btw`. Questions appear in independent bubbles, inherit conversation context, and keep existing host tool permissions. They do not automatically send annotations to the main conversation.

New side questions created since v1.1.3 have persistent identity markers. Their completion notifications enter the main session as reference context without waking an idle main agent; an already-running agent may read that context at its next step. Ordinary subtask notifications, user messages, and cleanup are unchanged. Older side questions lack reliable markers and are not migrated by title: create a fresh side question when testing notification isolation and keep the plugin enabled.

### Text annotations

Select assistant text and choose **Add to conversation**. Add an optional comment and save, or press Enter; focus returns to the main composer without sending. Collect several annotations and send from the composer. Numbered references and annotation pills navigate back to the source text.

### Reasoning shortcuts

With the main conversation composer focused:

- **Shift + ↑** raises reasoning effort by one supported level.
- **Shift + ↓** lowers reasoning effort by one supported level.

Levels come from the current model's native `reasoning.efforts`, in the declared array order and using the original IDs. There is no universal hardcoded list: `Major`, `Ultra`, `Off`, or `Minimal` participate only when the model declares them. The starting level is the session's `reasoningEffort`, falling back to the model's `defaultEffort` only when no explicit effort is selected. If neither identifies a valid level, the shortcut does nothing.

The highest and lowest levels do not wrap or submit redundant requests. Accepted changes preserve the composer draft, focus, and caret, and synchronize through the native model selector. Rapid presses are serialized per session and wait for confirmed selection state. External model/selection changes, failures, and module disposal discard stale queued operations rather than applying an old model's effort to a new selection.

Shortcuts apply only to the focused main composer and its session. They do not act in BTW/annotation inputs, search, settings, terminals, open menus, or IME composition. Unsupported models retain ordinary key behavior. This uses DSH's native fixed shortcut registration and session model directories, not a global custom keyboard handler or replacement model picker.

### Codex subscription compatibility

Reasoning changes use the same DSH model directory as `dsh-codex-subscription`, including dynamically declared `openai-codex` efforts. No subscription-plugin source changes or extra ChatGPT API requests are required. The selection keeps provider/model identity and changes reasoning effort only, without changing OAuth state, account quota, catalog refresh, output verbosity, or Fast/Ultrafast speed settings. Important host behavior: DSH’s native selectModel RPC also saves the chosen provider/model/effort as the default for future sessions. It exposes no session-only flag. This shortcut follows that native behavior; it cannot promise to leave global defaults unchanged without changing the host. Live compatibility with the installed subscription plugin must still be checked before release.

## Build and validation

```sh
npm ci
npm run check
npm run test:compat
```

`npm run check` includes the automated test suites and build. GitHub installation reads `lib/index.js` and `lib/client.js` directly: regenerate and commit `lib` after source changes.

**Release validation is still pending on real DSH Desktop and DSH Web.** Automated tests do not establish native event ordering, real IME behavior, or actual installation/upgrade success. Before release, verify both shortcuts and boundaries; rapid presses; model/session switching; focus, draft, and caret preservation; menu/IME exclusion; independent module toggles and disposal; BTW tools and notification isolation; annotation saving and source navigation; DeepSeek and Codex dynamic efforts; and unchanged Codex Fast/Ultrafast settings. Confirm the renamed repository resolves and upgrading preserves a single plugin instance and existing data. Do not mark these checks passed without an actual run.

## Maintenance, attribution, and licenses

Integrated and modified by [davidLi17](https://github.com/davidLi17). The original BTW plugin is by [MichengAI](https://github.com/MichengAI/dsh-btw), under [Apache-2.0](LICENSE). The retained technical identities identify the compatible installation, not the toolbox's display name or current integrator.

Annotations reuse [dsh-codex-annotations](https://github.com/deepseek-harness-plugins/dsh-codex-annotations), version 0.2.14, commit `9d405b1888ebbef1609e4b2f7ef6166f29012fcb`. Source is in `src/annotations`, under MIT: **Copyright (c) 2026 deepseekharness-plugin contributors**. The complete copyright, permission notice, and warranty disclaimer remain in [ANNOTATIONS-LICENSE](ANNOTATIONS-LICENSE). Original authorship and license notices are preserved.

## Optional side-question voice input

- Enable the official `@deepseek-ai/dsh-experimental-voice-input-bundle` to show the microphone in the side-question dialog. Prepare dependencies/models in native voice settings; this plugin never installs or downloads them automatically.
- Click to record, then click to stop and insert the transcript at the captured side-question selection. It only edits that draft, never sends automatically or writes to the main composer. Sending is disabled during capture/transcription; edits remain allowed, and conflicting transcripts are preserved for explicit insertion.
- Uses the browser's default microphone, not the native plugin's custom device choice. HTTPS/loopback and microphone permission are required. Cancel, dialog closure and service unload release recording and invalidate late results.
- SenseVoice runs on the DSH Host, which may be a different computer from the browser. Audio goes to that Host over DSH's authenticated connection. Without native speech, ordinary side questions remain available.
- The speech contract was checked against `0.2.1-rc.2`. Capture code is adapted from the official MIT implementation (see `VOICE-LICENSE`). No official-client changes, global voice shortcut or dictation in annotation editing fields.
