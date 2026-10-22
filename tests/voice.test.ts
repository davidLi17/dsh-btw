// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SelectionAsk } from '../src/client/SelectionAsk'
import { BubbleStore } from '../src/client/bubbles'
import { createVoiceBridge, mountVoiceBridge, type SpeechRemote } from '../src/client/voice/service'
import { translate } from '../src/locales'

const capture = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn(), dispose: vi.fn() }))
vi.mock('../src/client/voice/audio', () => ({
  Recording: class { start = capture.start; stop = capture.stop; dispose = capture.dispose },
  audioBase64: () => 'mock-audio',
}))
let root: Root, mount: HTMLElement, bridge: ReturnType<typeof createVoiceBridge>, store: BubbleStore
let remote: SpeechRemote
const ask = vi.fn(async () => ({ kind: 'success' as const, text: 'answer' }))
const settings = vi.fn()
const catalog = { selection: { providerId: 'sensevoice-local', language: 'auto' }, providers: [{ id: 'sensevoice-local', preparation: { phase: 'ready' } }], maxAudioBytes: 1000, maxDurationSeconds: 120 }
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  capture.start.mockReset().mockResolvedValue(undefined); capture.stop.mockReset().mockResolvedValue(new Uint8Array(4)); capture.dispose.mockReset().mockResolvedValue(undefined)
  ask.mockClear(); settings.mockClear()
  bridge = createVoiceBridge()
  remote = { catalog: vi.fn(async () => ({ ok: true as const, value: catalog })), transcribe: vi.fn(async () => ({ ok: true as const, value: { text: '语音' } })) }
  bridge.set({ remote, openSettings: settings })
  mount = document.createElement('div'); document.body.append(mount); root = createRoot(mount)
  store = new BubbleStore({ run: ask, close: async () => ({ kind: 'success', text: '' }) })
  await act(async () => root.render(React.createElement(SelectionAsk, { store, sessionId: 's', initialReference: '引用', voice: bridge, t: translate() })))
})
afterEach(async () => { await act(async () => root.unmount()); await store.dispose(); mount.remove(); vi.unstubAllGlobals() })
const input = () => mount.querySelector('textarea')!
async function edit(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input(), value)
    input().dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function click(label: string) {
  const button = [...mount.querySelectorAll('button')].find(el => el.textContent === label || el.getAttribute('aria-label') === label)
  expect(button).toBeTruthy()
  await act(async () => button!.click())
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes }); return { promise, resolve } }

it('inserts at captured selection in the side draft, preserves focus, never sends or alters main draft', async () => {
  const main = document.createElement('textarea'); main.value = 'main draft'; document.body.append(main)
  try {
    await edit('before after'); input().setSelectionRange(7, 7); input().focus()
    await click('开始旁问语音输入')
    expect(capture.start).toHaveBeenCalledTimes(1)
    await click('停止并转写')
    expect(input().value).toBe('before 语音after')
    expect(input().selectionStart).toBe(9)
    expect(document.activeElement).toBe(input())
    expect(main.value).toBe('main draft'); expect(ask).not.toHaveBeenCalled()
    expect(remote.transcribe).toHaveBeenCalledWith({ audioBase64: 'mock-audio', providerId: 'sensevoice-local', language: 'auto' }, expect.any(AbortSignal))
  } finally { main.remove() }
})
it('preserves asynchronous results after draft edits until explicit insertion', async () => {
  const result = deferred<Awaited<ReturnType<SpeechRemote['transcribe']>>>()
  vi.mocked(remote.transcribe).mockReturnValue(result.promise)
  await edit('old'); await click('开始旁问语音输入'); await click('停止并转写'); await edit('new')
  await act(async () => result.resolve({ ok: true as const, value: { text: ' transcript' } }))
  expect(input().value).toBe('new'); expect(mount.textContent).toContain('转写已保留')
  input().setSelectionRange(3, 3); await click('插入当前光标处')
  expect(input().value).toBe('new transcript'); expect(ask).not.toHaveBeenCalled()
})
it('hides when native speech is absent and releases capture on native unload', async () => {
  await click('开始旁问语音输入')
  await act(async () => bridge.set(undefined))
  expect(mount.querySelector('.btw-voice')).toBeNull(); expect(capture.dispose).toHaveBeenCalled()
  expect(input().disabled).toBe(false)
  await edit('still works'); await click('发送旁问'); expect(ask).toHaveBeenCalled()
})
it('unprepared speech opens native settings without requesting the microphone', async () => {
  vi.mocked(remote.catalog).mockResolvedValue({ ok: true as const, value: { ...catalog, providers: [{ id: 'sensevoice-local', preparation: { phase: 'unprepared' } }] } })
  await click('开始旁问语音输入'); expect(capture.start).not.toHaveBeenCalled()
  await click('打开原生语音设置'); expect(settings).toHaveBeenCalledTimes(1); expect(ask).not.toHaveBeenCalled()
})
it('cancel aborts pending transcription and ignores late results', async () => {
  const result = deferred<Awaited<ReturnType<SpeechRemote['transcribe']>>>()
  vi.mocked(remote.transcribe).mockReturnValue(result.promise)
  await edit('keep'); await click('开始旁问语音输入'); await click('停止并转写'); await click('取消语音')
  const signal = vi.mocked(remote.transcribe).mock.calls[0]![1]!
  expect(signal.aborted).toBe(true)
  await act(async () => result.resolve({ ok: true as const, value: { text: 'late' } }))
  expect(input().value).toBe('keep'); expect(capture.dispose).toHaveBeenCalled()
})
it('closing the dialog releases capture even while microphone permission is pending', async () => {
  const permission = deferred<void>(); capture.start.mockReturnValue(permission.promise)
  await click('开始旁问语音输入'); await click('取消')
  expect(capture.dispose).toHaveBeenCalled()
  await act(async () => permission.resolve())
  expect(mount.querySelector('textarea')).toBeNull(); expect(remote.transcribe).not.toHaveBeenCalled()
})
it('does not submit Enter or explanation while recording; recovers from permission failure', async () => {
  await edit('keep'); await click('开始旁问语音输入')
  await act(async () => input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })))
  await click('解释一下'); expect(ask).not.toHaveBeenCalled()
  await click('取消语音'); capture.start.mockRejectedValueOnce(new Error('permission'))
  await click('开始旁问语音输入'); expect(mount.textContent).toContain('语音输入失败')
  expect(capture.dispose).toHaveBeenCalled(); expect(input().value).toBe('keep')
})
it('binds the optional public speech service and removes it on Cordis unload', async () => {
  const ctx = new Context(), optional = createVoiceBridge()
  const plugin = ctx.plugin(scope => mountVoiceBridge(scope, optional)); await plugin.await()
  expect(optional.getSnapshot()).toBeUndefined()
  const native = ctx.plugin(scope => { scope.provide('remote.speech', remote) }); await native.await()
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(optional.getSnapshot()?.remote).toBeTruthy()
  await native.dispose(); expect(optional.getSnapshot()).toBeUndefined()
  await plugin.dispose()
})

it('switching session invalidates an in-flight result even when the dialog component is reused', async () => {
  const result = deferred<Awaited<ReturnType<SpeechRemote['transcribe']>>>()
  vi.mocked(remote.transcribe).mockReturnValue(result.promise)
  await edit('keep'); await click('开始旁问语音输入'); await click('停止并转写')
  await act(async () => root.render(React.createElement(SelectionAsk, { store, sessionId: 'other', initialReference: '引用', voice: bridge, t: translate() })))
  await act(async () => result.resolve({ ok: true, value: { text: 'late old session' } }))
  expect(input().value).toBe('keep'); expect(capture.dispose).toHaveBeenCalled(); expect(ask).not.toHaveBeenCalled()
})
