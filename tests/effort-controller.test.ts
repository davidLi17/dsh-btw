import { describe, expect, it, vi, afterEach } from 'vitest'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { ModelSelection } from '@deepseek-ai/dsh-api-session-controller/types'
import { EffortController, effortPosition, type EffortDirectory } from '../src/client/effort-controller'

function fixture(ids = ['minimal', 'low', 'high', 'ultra'], effort: string | undefined = 'low') {
  let state: ModelDirectoryState = { current: { provider: 'openai-codex', model: 'test', reasoningEffort: effort },
    routable: true, status: 'ready', pending: null, error: null, failures: [],
    groups: [{ id: 'openai-codex', name: 'Codex', models: [{ id: 'test', name: 'Test', reasoning: { defaultEffort: 'low', efforts: ids.map(id => ({ id, name: id })) } }] }] }
  const listeners = new Set<() => void>()
  const update = (patch: Partial<ModelDirectoryState>) => { state = { ...state, ...patch }; for (const fn of [...listeners]) fn() }
  const acknowledgements: ((value: { ok: true; value: undefined }) => void)[] = []
  const select = vi.fn((target: ModelSelection) => {
    update({ status: 'selecting', pending: target })
    return new Promise<{ ok: true; value: undefined }>(resolve => acknowledgements.push(resolve))
  })
  const directory: EffortDirectory = { store: { getSnapshot: () => state, subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }, set: (value: ModelDirectoryState) => update(value), update: (recipe: (state: ModelDirectoryState) => void) => { const next = { ...state }; recipe(next); update(next) } }, select }
  const ack = () => { update({ status: 'ready', pending: null }); acknowledgements.shift()!({ ok: true, value: undefined }) }
  const project = (index = select.mock.calls.length - 1) => update({ current: select.mock.calls[index]![0] })
  return { directory, select, update, ack, project, listeners }
}
const tick = async () => { for (let i = 0; i < 5; i++) await Promise.resolve() }
afterEach(() => vi.useRealTimers())

describe('catalog-driven reasoning controller', () => {
  it('uses declared order, provider default and exact IDs without universal levels', () => {
    const f = fixture(['low', 'major', 'max', 'ultra'], undefined)
    expect(effortPosition(f.directory.store.getSnapshot())?.index).toBe(0)
    const c = new EffortController(() => f.directory)
    expect(c.move('a', 1)).toBe(true)
    expect(f.select).toHaveBeenCalledWith({ provider: 'openai-codex', model: 'test', reasoningEffort: 'major' })
    c.dispose()
  })
  it('prefers explicit session effort and passes a catalog with no resolvable default', () => {
    const f = fixture(['off', 'low', 'high'], 'high')
    expect(effortPosition(f.directory.store.getSnapshot())?.index).toBe(2)
    f.update({ current: { provider: 'openai-codex', model: 'test' }, groups: [{ id: 'openai-codex', name: 'Codex', models: [{ id: 'test', name: 'Test', reasoning: { efforts: [{ id: 'off', name: 'Off' }, { id: 'high', name: 'High' }] } }] }] })
    expect(effortPosition(f.directory.store.getSnapshot())).toBeUndefined()
  })
  it('supports DeepSeek and non-contiguous provider-specific levels without touching preference fields', () => {
    const f = fixture(['off', 'high'], 'off')
    const state = f.directory.store.getSnapshot()
    f.update({ current: { provider: 'deepseek', model: 'reasoner', reasoningEffort: 'off' }, groups: [{ ...state.groups[0]!, id: 'deepseek', models: [{ ...state.groups[0]!.models[0]!, id: 'reasoner' }] }] })
    const c = new EffortController(() => f.directory)
    c.move('a', 1)
    expect(f.select.mock.calls[0]?.[0]).toEqual({ provider: 'deepseek', model: 'reasoner', reasoningEffort: 'high' })
    c.dispose()
  })
  it('serializes rapid moves and waits for RPC plus durable projection in either order', async () => {
    const f = fixture(); const c = new EffortController(() => f.directory)
    c.move('a', 1); c.move('a', 1); c.move('a', -1)
    expect(f.select).toHaveBeenCalledTimes(1)
    f.ack(); await tick(); expect(f.select).toHaveBeenCalledTimes(1)
    f.project(); await tick(); expect(f.select.mock.calls[1]?.[0].reasoningEffort).toBe('ultra')
    f.project(); await tick(); expect(f.select).toHaveBeenCalledTimes(2)
    f.ack(); await tick(); expect(f.select.mock.calls[2]?.[0].reasoningEffort).toBe('high')
    f.ack(); f.project(); await tick(); expect(f.listeners.size).toBe(0)
    c.dispose()
  })
  it('clamps boundaries without RPC and passes unsupported models to native input', () => {
    const f = fixture(['low', 'high'], 'high'); const c = new EffortController(() => f.directory)
    expect(c.move('a', 1)).toBe(true); expect(f.select).not.toHaveBeenCalled()
    f.update({ current: { provider: 'openai-codex', model: 'test', reasoningEffort: 'unknown' } })
    expect(c.move('a', 1)).toBe(false)
    f.update({ groups: [] }); expect(c.move('a', -1)).toBe(false)
    c.dispose()
  })
  it('keeps two session queues independent', async () => {
    const a = fixture(); const b = fixture(); const c = new EffortController(id => id === 'a' ? a.directory : b.directory)
    c.move('a', 1); c.move('a', 1); c.move('b', -1)
    expect(a.select).toHaveBeenCalledTimes(1); expect(b.select.mock.calls[0]?.[0].reasoningEffort).toBe('minimal')
    b.project(); b.ack(); await tick(); expect(a.select).toHaveBeenCalledTimes(1)
    c.dispose(); expect(a.listeners.size + b.listeners.size).toBe(0)
  })
  it.each(['model', 'effort', 'pending', 'catalog', 'loading'] as const)('drops queue on external %s changes, including transient updates during RPC', async change => {
    const f = fixture(); const c = new EffortController(() => f.directory)
    c.move('a', 1); c.move('a', 1)
    const original = f.directory.store.getSnapshot()
    if (change === 'model') f.update({ current: { ...original.current!, model: 'other' } })
    if (change === 'effort') f.update({ current: { ...original.current!, reasoningEffort: 'minimal' } })
    if (change === 'pending') f.update({ pending: { ...original.current!, reasoningEffort: 'ultra' } })
    if (change === 'catalog') f.update({ groups: [] })
    if (change === 'loading') f.update({ status: 'loading' })
    f.update(original); f.project(); f.ack(); await tick()
    expect(f.select).toHaveBeenCalledTimes(1); expect(f.listeners.size).toBe(0)
    c.dispose()
  })
  it('does not follow a changed directory/session binding', async () => {
    const f = fixture(); const replacement = fixture(); let current = f.directory
    const c = new EffortController(() => current)
    c.move('a', 1); c.move('a', 1); current = replacement.directory
    f.ack(); f.project(); await tick()
    expect(replacement.select).not.toHaveBeenCalled(); c.dispose()
  })
  it('stops on rejection without rolling back newer choices or retrying', async () => {
    const f = fixture(); f.select.mockImplementationOnce(() => Promise.reject(new Error('offline')))
    const c = new EffortController(() => f.directory)
    c.move('a', 1); c.move('a', 1); await tick()
    expect(f.select).toHaveBeenCalledTimes(1); expect(f.directory.store.getSnapshot().current?.reasoningEffort).toBe('low')
    expect(f.listeners.size).toBe(0); c.dispose()
  })
  it('times out unconfirmed requests and cleans up pending waits on reset/dispose', async () => {
    vi.useFakeTimers()
    const f = fixture(); const c = new EffortController(() => f.directory, 20)
    c.move('a', 1); c.move('a', 1); f.ack(); await tick(); await vi.advanceTimersByTimeAsync(21)
    expect(f.select).toHaveBeenCalledTimes(1); expect(f.listeners.size).toBe(0)
    f.project(); c.move('a', 1); c.reset(); expect(f.listeners.size).toBe(0)
    c.dispose(); expect(c.move('a', 1)).toBe(false)
  })
  it('handles missing session directories and busy external selections safely', () => {
    expect(new EffortController(() => { throw Error('missing') }).move('a', 1)).toBe(false)
    const f = fixture(); f.update({ status: 'selecting', pending: f.directory.store.getSnapshot().current })
    const c = new EffortController(() => f.directory)
    expect(c.move('a', 1)).toBe(false); c.dispose()
  })
})
