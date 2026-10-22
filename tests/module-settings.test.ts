import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import { Config } from '../src/config'
import { DEFAULT_MODULE_SETTINGS, moduleLifecycle, moduleSettings, type ModuleSettings } from '../src/module-settings'
import * as host from '../src/index'
import * as client from '../src/client/index'
import { hostLocaleRuntime } from './host-client-fixtures'

const tick = async () => { for (let n = 0; n < 12; n++) await new Promise(resolve => setImmediate(resolve)) }
afterEach(() => vi.unstubAllGlobals())

it('keeps old configuration default-on and validates independent live flags', () => {
  expect(moduleSettings(Config({}))).toEqual(DEFAULT_MODULE_SETTINGS)
  expect(moduleSettings(Config({ btw: false, reasoningShortcuts: false }))).toEqual({ btw: false, annotations: true, reasoningShortcuts: false })
  expect(() => Config({ annotations: 'false' } as never)).toThrow()
})

it('disposes only the disabled feature and recreates it without leaking other scopes', async () => {
  const ctx = new Context()
  const mounted = { btw: vi.fn(), annotations: vi.fn(), reasoningShortcuts: vi.fn() }
  const stopped = { btw: vi.fn(), annotations: vi.fn(), reasoningShortcuts: vi.fn() }
  let modules!: ReturnType<typeof moduleLifecycle>
  const plugin = ctx.plugin(async scope => {
    modules = moduleLifecycle(scope, Object.fromEntries(Object.keys(mounted).map(key => [key, (child: Context) => {
      mounted[key as keyof typeof mounted]()
      child.effect(() => stopped[key as keyof typeof stopped])
    }])))
    await modules.update(DEFAULT_MODULE_SETTINGS)
  })
  await plugin.await()
  await modules.update({ ...DEFAULT_MODULE_SETTINGS, btw: false })
  expect(stopped.btw).toHaveBeenCalledOnce()
  expect(stopped.annotations).not.toHaveBeenCalled()
  await modules.update(DEFAULT_MODULE_SETTINGS)
  expect(mounted.btw).toHaveBeenCalledTimes(2)
  expect(mounted.annotations).toHaveBeenCalledOnce()
  await plugin.dispose()
  expect(stopped.annotations).toHaveBeenCalledOnce()
  expect(stopped.reasoningShortcuts).toHaveBeenCalledOnce()
  await ctx.fiber.dispose()
})

it('Host flags gate commands and annotation projections independently', async () => {
  const ctx = new Context()
  const original = () => []
  const session = { deriveMessages: original, deriveEventMessage: original }
  const commands = new Map()
  ctx.provide('sessions', { list: () => [session] })
  ctx.provide('commands', { register: (value: { name: string }) => { commands.set(value.name, value); return () => commands.delete(value.name) } })
  ctx.provide('subagents', { getProvider: () => undefined })
  ctx.provide('tools', {})
  let btw = false
  let annotations = true
  const config = { btw: { get: () => btw }, annotations: { get: () => annotations } }
  const plugin = ctx.plugin({ apply: scope => host.apply(scope, config), inject: host.inject })
  await plugin.await()
  expect(commands.size).toBe(0)
  expect(session.deriveMessages).not.toBe(original)
  btw = true
  annotations = false
  plugin.ctx.emit('loader/volatile-update', [])
  await tick()
  expect(commands.has('btw')).toBe(true)
  expect(session.deriveMessages).toBe(original)
  await plugin.dispose()
  expect(session.deriveMessages).toBe(original)
  const next = ctx.plugin(host, { annotations: false })
  await next.await()
  expect(commands.has('btw')).toBe(true)
  expect(session.deriveMessages).toBe(original)
  await next.dispose()
  expect(commands.size).toBe(0)
  await ctx.fiber.dispose()
})

it('native settings mirror toggles client modules without modifying saved annotations', async () => {
  const ctx = new Context()
  const storage = { getItem: vi.fn(() => '{"annotations":[{"id":"saved"}]}'), setItem: vi.fn(), removeItem: vi.fn() }
  const styles: { removed: boolean; dataset: Record<string, string>; textContent: string; remove(): void }[] = []
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {}, localStorage: storage })
  vi.stubGlobal('document', { createElement: () => {
    const style = { removed: false, dataset: {}, textContent: '', remove() { this.removed = true } }; styles.push(style); return style
  }, head: { append() {} } })
  const commands = { candidates: async () => [], dispatch: vi.fn(), matchSpace: vi.fn(), matchEnter: vi.fn(), execute: vi.fn() }
  const originalDispatch = commands.dispatch
  const sourceStop = vi.fn()
  const sourceRegister = vi.fn(() => sourceStop)
  ctx.provide('sessions', { scope: () => ctx })
  ctx.provide('uiConversation', {})
  ctx.provide('inputTriggers', { registerSource: sourceRegister })
  ctx.provide('conversation', { input: { for: () => ({}) } })
  ctx.provide('slots', { entries: () => [], inject: () => () => {}, register: () => () => {} })
  ctx.provide('remote', { commands: { execute: vi.fn() } })
  ctx.provide('remote.commands', { execute: vi.fn() })
  ctx.provide('commandUi', commands)
  const Locale = hostLocaleRuntime()
  ctx.provide('locale', new Locale(ctx))
  let settings: ModuleSettings = { ...DEFAULT_MODULE_SETTINGS }
  const watchers = new Set<() => void>()
  const unsubscribe = vi.fn()
  const get = vi.fn(() => ({ getSnapshot: () => ({ value: settings }), subscribe: (fn: () => void) => {
    watchers.add(fn); return () => { watchers.delete(fn); unsubscribe() }
  } }))
  ctx.provide('configForms', { get })
  const plugin = ctx.plugin(client)
  await plugin.await()
  await tick()
  expect(get).toHaveBeenCalledWith('michengai-btw')
  expect(sourceRegister).toHaveBeenCalledOnce()
  const set = async (change: Partial<ModuleSettings>) => { settings = { ...settings, ...change }; for (const fn of watchers) fn(); await tick() }
  await set({ btw: false })
  expect(commands.dispatch({})).toBeUndefined()
  expect(sourceStop).not.toHaveBeenCalled()
  expect(styles.filter(style => !style.removed)).toHaveLength(1)
  await set({ annotations: false })
  expect(sourceStop).toHaveBeenCalledOnce()
  expect(styles.every(style => style.removed)).toBe(true)
  await set({ annotations: true })
  expect(sourceRegister).toHaveBeenCalledTimes(2)
  expect(storage.setItem).not.toHaveBeenCalled()
  expect(storage.removeItem).not.toHaveBeenCalled()
  await set({ btw: true })
  expect(commands.dispatch).not.toBe(originalDispatch)
  await plugin.dispose()
  expect(unsubscribe).toHaveBeenCalledOnce()
  expect(styles.every(style => style.removed)).toBe(true)
  await ctx.fiber.dispose()
})
