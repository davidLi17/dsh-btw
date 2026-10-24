import { Context, Service } from '@deepseek-ai/cordis'
import type { SessionInputResolver } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import { expect, it, vi } from 'vitest'
import { createSidebarBridge, subagentChatAddress, type NativeSidebar } from '../src/client/sidebar'
import { translate } from '../src/locales'

const address = { parentSessionId: 'parent-session', childSessionId: 'original-child', mode: 'continuable' as const }
const signal = () => new AbortController().signal
function fixture() {
  let parent: string | undefined = address.parentSessionId
  let active: { contentId: string } | undefined
  let expanded = true
  let registered = true
  const tabs = new Map<string, { contentId: string }>()
  const registryListeners = new Set<() => void>()
  const mountedListeners = new Set<() => void>()
  const draft = { text: '保留当前草稿', chips: ['existing-reference'], images: ['existing-image'], caret: 3 }
  const input = { focus: vi.fn(), setDraft: vi.fn(), submit: vi.fn(), addAttachments: vi.fn(), removeAttachment: vi.fn(), state: { getSnapshot: () => draft } }
  const inputFor = vi.fn(() => input)
  const scope = { conversation: { input: { for: inputFor } } } as unknown as Context
  const sessions = { scope: vi.fn(() => scope), create: vi.fn(), fork: vi.fn(), retain: vi.fn() } as unknown as ISessions
  const sidebar: NativeSidebar = {
    mounted: {
      getSnapshot: () => parent,
      subscribe: listener => { mountedListeners.add(listener); return () => { mountedListeners.delete(listener) } },
    },
    openResource: vi.fn((resource, options) => {
      // Public host contract: reveal existing (kind, contentId), otherwise add one.
      expect(options.revealIfOpened).toBe(true)
      active = tabs.get(resource) ?? { contentId: resource }
      tabs.set(resource, active)
      expanded = true
    }),
    active: () => active,
    isExpanded: () => expanded,
  }
  const registry = {
    get: vi.fn(() => registered ? { kind: 'subagentchat' } : undefined),
    subscribe: (listener: () => void) => { registryListeners.add(listener); return () => { registryListeners.delete(listener) } },
  }
  const execute = vi.fn(async (_parent: string, _line: string, _signal?: AbortSignal) => ({ kind: 'success' as 'success' | 'error', text: JSON.stringify(address) }))
  const bridge = createSidebarBridge(sessions, execute, translate(), { for: inputFor } as unknown as SessionInputResolver)
  const detach = bridge.attach(sidebar, registry)
  return {
    bridge, sidebar, execute, input, inputFor, scope, sessions, tabs, draft, detach,
    switchParent(value: string | undefined) { parent = value; for (const listener of mountedListeners) listener() },
    register(value: boolean) { registered = value; for (const listener of registryListeners) listener() },
    hide() { expanded = false },
    selectOther() { active = { contentId: 'dsh-resource://file/another' } },
  }
}

it('queries the original parent/request only and opens the canonical native child resource', async () => {
  const f = fixture(), abortSignal = signal()
  await f.bridge.openInSidebar(address.parentSessionId, 'request01', abortSignal)
  expect(f.execute).toHaveBeenCalledExactlyOnceWith(address.parentSessionId, '/btw-child request01', abortSignal)
  expect(f.sidebar.openResource).toHaveBeenCalledExactlyOnceWith(
    'dsh-resource://subagentchat/session/original-child?parent=parent-session&mode=continuable',
    { kind: 'subagentchat', preferNewPane: true, revealIfOpened: true },
  )
  expect(f.sessions.create).not.toHaveBeenCalled()
  expect(f.sessions.fork).not.toHaveBeenCalled()
  expect(f.sessions.retain).not.toHaveBeenCalled()
  expect(f.input.submit).not.toHaveBeenCalled()
})

it('uses the host URI encoding without copying a prompt or quote into the address', () => {
  const resource = subagentChatAddress({ parentSessionId: 'parent &/?', childSessionId: 'child /#?', mode: 'continuable' })
  expect(resource).toBe('dsh-resource://subagentchat/session/child%20%2F%23%3F?parent=parent+%26%2F%3F&mode=continuable')
  expect(new URL(resource).searchParams.get('parent')).toBe('parent &/?')
})

it('reveals the same native tab on repeated opens and only focuses the child’s unchanged composer', async () => {
  const f = fixture()
  for (let repeat = 0; repeat < 2; repeat++) {
    await f.bridge.openInSidebar(address.parentSessionId, 'request01', signal())
    const focus = f.bridge.getSnapshot().focus!
    f.bridge.focusComposer(address.parentSessionId, focus)
    expect(f.bridge.getSnapshot().focus).toBe(focus)
    f.bridge.focusComposer(address.childSessionId, focus)
    f.bridge.focusComposer(address.childSessionId, focus)
  }
  expect(f.tabs.size).toBe(1)
  expect(f.input.focus).toHaveBeenCalledTimes(2)
  expect(f.inputFor).toHaveBeenCalledWith(f.scope)
  expect(f.input.state.getSnapshot()).toBe(f.draft)
  expect(f.draft).toEqual({ text: '保留当前草稿', chips: ['existing-reference'], images: ['existing-image'], caret: 3 })
  expect(f.input.setDraft).not.toHaveBeenCalled()
  expect(f.input.submit).not.toHaveBeenCalled()
  expect(f.input.addAttachments).not.toHaveBeenCalled()
  expect(f.input.removeAttachment).not.toHaveBeenCalled()
})

it('waits for the existing child startup, without opening prematurely or sending another run', async () => {
  const f = fixture()
  let ready!: (result: { kind: 'success'; text: string }) => void
  f.execute.mockImplementation(() => new Promise(resolve => { ready = resolve }))
  const opening = f.bridge.openInSidebar(address.parentSessionId, 'request01', signal())
  expect(f.sidebar.openResource).not.toHaveBeenCalled()
  ready({ kind: 'success', text: JSON.stringify(address) })
  await opening
  expect(f.execute).toHaveBeenCalledTimes(1)
  expect(f.sidebar.openResource).toHaveBeenCalledTimes(1)
})

it('tracks native service and subagentchat registry availability without substituting a new task', async () => {
  const f = fixture()
  expect(f.bridge.getSnapshot().available).toBe(true)
  f.register(false)
  expect(f.bridge.getSnapshot().available).toBe(false)
  await expect(f.bridge.openInSidebar(address.parentSessionId, 'request01', signal())).rejects.toThrow('侧边栏')
  expect(f.execute).not.toHaveBeenCalled()
  f.register(true)
  expect(f.bridge.getSnapshot().available).toBe(true)
  f.detach()
  expect(f.bridge.getSnapshot()).toEqual({ available: false })
})

it.each([
  '{}', 'not-json', JSON.stringify({ ...address, parentSessionId: 'other-parent' }),
  JSON.stringify({ ...address, mode: 'one-shot' }), JSON.stringify({ ...address, childSessionId: '' }),
  JSON.stringify({ ...address, childSessionId: address.parentSessionId }),
])('rejects unavailable, mismatched, and malformed child results: %s', async text => {
  const f = fixture()
  f.execute.mockResolvedValue({ kind: 'success', text })
  await expect(f.bridge.openInSidebar(address.parentSessionId, 'request01', signal())).rejects.toThrow('尚未就绪')
  expect(f.sidebar.openResource).not.toHaveBeenCalled()
})

it('does not open in another parent after navigation changes during lookup', async () => {
  const f = fixture()
  f.execute.mockImplementation(async () => {
    f.switchParent('other-parent')
    return { kind: 'success', text: JSON.stringify(address) }
  })
  await expect(f.bridge.openInSidebar(address.parentSessionId, 'request01', signal())).rejects.toThrow('主会话已切换')
  expect(f.sidebar.openResource).not.toHaveBeenCalled()
})

it('does not open after closing the bubble during lookup, even when transport ignores abort', async () => {
  const f = fixture(), controller = new AbortController()
  f.execute.mockImplementation(async () => {
    controller.abort()
    return { kind: 'success', text: JSON.stringify(address) }
  })
  await f.bridge.openInSidebar(address.parentSessionId, 'request01', controller.signal)
  expect(f.sidebar.openResource).not.toHaveBeenCalled()
  expect(f.bridge.getSnapshot().focus).toBeUndefined()
})

it.each(['hide', 'selectOther', 'switchParent'] as const)('does not focus a hidden, closed, or superseded pane: %s', async action => {
  const f = fixture()
  await f.bridge.openInSidebar(address.parentSessionId, 'request01', signal())
  const focus = f.bridge.getSnapshot().focus!
  if (action === 'switchParent') f.switchParent('other-parent')
  else f[action]()
  f.bridge.focusComposer(address.childSessionId, focus)
  expect(f.input.focus).not.toHaveBeenCalled()
})

it('propagates readable lookup and native navigation errors without a fallback send', async () => {
  const f = fixture()
  f.execute.mockResolvedValueOnce({ kind: 'error', text: '原始旁问不存在' })
  await expect(f.bridge.openInSidebar(address.parentSessionId, 'request01', signal())).rejects.toThrow('原始旁问不存在')
  vi.mocked(f.sidebar.openResource).mockImplementationOnce(() => { throw new Error('native pane unavailable') })
  await expect(f.bridge.openInSidebar(address.parentSessionId, 'request01', signal())).rejects.toThrow('打开侧边栏失败')
  expect(f.bridge.getSnapshot().focus).toBeUndefined()
  expect(f.input.submit).not.toHaveBeenCalled()
})

it('focuses through the injected public service, not an uninjected retained Cordis context', async () => {
  const root = new Context()
  let childScope!: Context
  const focus = vi.fn()
  const input = { for: vi.fn(() => ({ focus })) } as unknown as SessionInputResolver
  class Conversation extends Service {
    constructor(ctx: Context) { super(ctx, 'conversation') }
    get input() { return input }
  }
  await root.plugin((ctx: Context) => { new Conversation(ctx) }).await()
  await root.plugin((ctx: Context) => { childScope = ctx.extend() }).await()
  let bridge!: ReturnType<typeof createSidebarBridge>
  const f = fixture()
  const sessions = { scope: () => childScope } as unknown as ISessions
  const plugin = root.plugin({ inject: ['conversation'], apply(ctx: Context) {
    bridge = createSidebarBridge(sessions, f.execute, translate(), ctx.conversation.input)
  } })
  try {
    await plugin.await()
    expect(() => childScope.conversation).toThrow('inject')
    bridge.attach(f.sidebar, { get: () => ({ kind: 'subagentchat' }) })
    await bridge.openInSidebar(address.parentSessionId, 'request01', signal())
    bridge.focusComposer(address.childSessionId, bridge.getSnapshot().focus!)
    expect(input.for).toHaveBeenCalledWith(childScope)
    expect(focus).toHaveBeenCalledOnce()
  } finally { await root.fiber.dispose() }
})
