import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { applyRecap, RECAP_PROMPT } from '../src/client/recap'

// Execute the installed host command dispatch/adjudication code, with a small input fixture.
const require = createRequire(import.meta.url)
let Host: any
runInNewContext(readFileSync(require.resolve('@deepseek-ai/dsh-client-ui-commands/client'), 'utf8'), {
  window: { __ModuleLoader__: { load: (entry: any) => {
    Host = entry.factory((id: string) => id === '@deepseek-ai/dsh-client-ui-primitives' ? {} : require(id)).CommandUiRuntime
  } } },
})
function fixture() {
  const listeners = new Set<() => void>()
  const disposers: (() => void)[] = []
  let state = { draft: '/recap', draftRev: 0, phase: 'plain' }
  const publish = () => { for (const listener of [...listeners]) listener() }
  const input = {
    state: { getSnapshot: () => state, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } } },
    setDraft: (draft: string) => { state = { ...state, draft, draftRev: state.draftRev + 1 }; publish() },
    submit: vi.fn(),
  }
  const actx = { conversation: { input: { for: () => input } }, bail: () => { input.setDraft(''); return true } }
  const sessions = { scope: () => actx, subagentAddress: () => undefined }
  const host = Object.create(Host.prototype)
  host.live = { contributions: new Map() }
  host.directory = { ensureReady: async () => [], resolve: () => undefined }
  host.sessions = () => sessions
  host.register = (entry: any) => { host.live.contributions.set(entry.name, entry); disposers.push(() => host.live.contributions.delete(entry.name)); return () => {} }
  const ctx = {
    inject: (_: unknown, callback: (ctx: unknown) => void) => callback(ctx),
    get: (key: string) => key === 'commandUi' ? host : key === 'conversation' ? actx.conversation : sessions,
    effect: (fn: () => () => void) => disposers.push(fn()),
  }
  applyRecap(ctx as unknown as Context)
  const session = { sessionId: 'main' }
  return { host, input, session, listeners, disposers, phase: (phase: string) => { state = { ...state, phase }; publish() } }
}

describe('/recap native command action', () => {
  it('keeps every native command visible with a real independent Cordis session scope', async () => {
    const root = new Context()
    const input = { state: { getSnapshot: () => ({ draft: '', draftRev: 0, phase: 'plain' }) } }
    // Like the host, conversation is provided by a sibling plugin, not root.
    // A plain object (or root-provided service) hides Cordis's inject boundary.
    const provider = root.plugin(scope => {
      scope.provide('conversation', { input: { for: () => input } } as any)
    })
    const sessionFiber = root.plugin(() => {})
    await Promise.all([provider.await(), sessionFiber.await()])
    const actx = sessionFiber.ctx
    const sessions = { scope: () => actx, subagentAddress: () => undefined }
    const host = Object.create(Host.prototype)
    const nativeNames = ['compact', 'permission', 'export', 'btw']
    host.live = { contributions: new Map([['model', { name: 'model', available: () => true }]]) }
    host.t = (key: string) => key
    host.directory = { ensureReady: async () => nativeNames.map(name => ({ name, description: name })) }
    host.register = (entry: any) => {
      host.live.contributions.set(entry.name, entry)
      return () => host.live.contributions.delete(entry.name)
    }
    const services = root.plugin(scope => {
      scope.provide('sessions', sessions as any)
      scope.provide('commandUi', host)
    })
    await services.await()
    const session = { sessionId: 'main' }
    const request = { query: '', position: 'leading', signal: new AbortController().signal }
    const names = async () => (await host.candidates(session, request)).map((row: any) => row.name).sort()
    const before = await names()
    const plugin = root.plugin({ inject: ['sessions', 'conversation'], apply: applyRecap })
    try {
      await plugin.await()
      // Exactly the context shape returned by the native Session Controller.
      expect(() => actx.conversation).toThrow('cannot get property "conversation" without inject')
      expect(before).toEqual([...nativeNames, 'model'].sort())
      await expect(names()).resolves.toEqual([...before, 'recap'].sort())
    } finally { await root.fiber.dispose() }
  })

  it('registers a menu action and sends the exact two-line prompt once on selection', async () => {
    const f = fixture()
    expect(f.host.live.contributions.get('recap').ui.kind).toBe('action')
    expect(f.input.submit).not.toHaveBeenCalled()
    f.host.dispatch({ candidate: { name: 'recap' }, session: f.session, span: {} })
    await Promise.resolve()
    expect(f.input.state.getSnapshot().draft).toBe('1. 对话主线 recap，整理其中信息。\n2. 给我对我最重要的信息。')
    await Promise.resolve()
    expect(f.input.submit).toHaveBeenCalledTimes(1)
    expect(f.listeners.size).toBe(0)
  })
  it('bare Enter waits for host adjudication to unlock, then sends once', async () => {
    const f = fixture()
    f.phase('adjudicating')
    await expect(f.host.matchEnter(f.session, '/recap', new AbortController().signal, { attachments: 0 })).resolves.toBe('handled')
    expect(f.input.submit).not.toHaveBeenCalled()
    f.phase('plain')
    await Promise.resolve()
    expect(f.input.submit).toHaveBeenCalledTimes(1)
    expect(f.input.state.getSnapshot().draft).toBe(RECAP_PROMPT)
  })
  it('typing, Space and longer lines do not send or expand', async () => {
    const f = fixture()
    expect(f.host.matchSpace(f.session, '/recap')).toBeUndefined()
    for (const line of ['/recap more text', '/recap\nmore', '/recapture']) {
      await expect(f.host.matchEnter(f.session, line, new AbortController().signal, { attachments: 0 })).resolves.toBeUndefined()
    }
    expect(f.input.submit).not.toHaveBeenCalled()
    expect(f.input.state.getSnapshot().draft).toBe('/recap')
  })
  it('unloading cancels a pending send and unregisters; newer drafts are not sent', async () => {
    for (const unload of [true, false]) {
      const f = fixture()
      f.host.dispatch({ candidate: { name: 'recap' }, session: f.session, span: {} })
      if (unload) f.disposers.forEach(off => off())
      else { await Promise.resolve(); f.input.setDraft('new text') }
      await Promise.resolve()
      expect(f.input.submit).not.toHaveBeenCalled()
      expect(f.listeners.size).toBe(0)
      if (unload) expect(f.host.live.contributions.size).toBe(0)
    }
  })
})
