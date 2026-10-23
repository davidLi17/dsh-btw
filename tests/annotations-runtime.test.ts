// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { createRuntime } from '../src/annotations/runtime.js'
import { AnnotationStore, encodePayload } from '../src/annotations/core.js'

const cleanups: (() => void)[] = []
afterEach(() => { cleanups.splice(0).reverse().forEach(fn => fn()); localStorage.clear(); document.body.innerHTML = '' })
const selector = { nodeKey: 'source', quote: '原文', start: 0, end: 2, prefix: '', suffix: '' }
function fixture(withSubmission = true, nodes: any[] = []) {
  localStorage.clear()
  const effects: (() => void)[] = []
  const effect = (factory: () => (() => void)) => { const off = factory(); effects.push(off); return off }
  const subscribe = () => () => {}
  const begin = vi.fn(function (this: any, options: any) { return { requestId: 'request-1', owner: this, options } })
  const session: any = { projections: { faceOf: () => ({ getSnapshot: () => ({}), subscribe }) } }
  if (withSubmission) session.beginSubmission = begin
  const state = { phase: 'idle', draft: '保持草稿', draftRev: 0, occurrences: [] as any[] }
  const binding = { session, ctx: { effect, bail: (_: unknown, _event: string, value: any) => {
    state.occurrences.push({ ...value.reference, offset: 0, length: 1 }); return true
  } } }
  const ctx = { sessions: { binding: () => binding },
    conversation: { input: { for: () => ({ state: { getSnapshot: () => state, subscribe } }) } },
    uiConversation: { binding: () => ({ target: () => ({ getSnapshot: () => ({ nodes: new Map(nodes.map(n => [n.key, n])) }), subscribe }) }) } }
  const runtime = createRuntime(ctx), face = runtime.faceFor('s1')
  cleanups.push(() => runtime.dispose())
  return { runtime, face, session, begin, state, effects }
}
function historyPayload() {
  const data = new Map(), store = new AnnotationStore({ getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) }, 's1')
  store.add(selector)
  return store.prepare(store.getSnapshot().ref)
}
it('即时回显只改展示 text，发送序列化、草稿、请求元数据保持；卸载恢复方法', async () => {
  const { runtime, face, session, begin, state } = fixture()
  face.add(selector)
  const text = await runtime.source.codec.serialize(face.store.getSnapshot().ref, new AbortController().signal)
  const options = Object.freeze({ text, requestId: 'native-1', custom: { keep: true } })
  const result = session.beginSubmission(options)
  expect(result.owner).toBe(session)
  expect(result.options).toEqual({ ...options, text: '1 条注释' })
  expect(result.requestId).toBe('request-1')
  expect(options.text).toContain('[DSH_ANNOTATIONS_V1:')
  expect(state.draft).toBe('保持草稿')
  const plain = { text: '普通消息' }
  session.beginSubmission(plain)
  expect(begin.mock.calls[1]![0]).toBe(plain)
  runtime.dispose()
  expect(session.beginSubmission).toBe(begin)
})
it('旧宿主没有 beginSubmission 仍可添加和序列化批注', async () => {
  const { runtime, face, session } = fixture(false)
  expect(face.add(selector)!.number).toBe(1)
  expect(await runtime.source.codec.serialize(face.store.getSnapshot().ref, new AbortController().signal)).toContain('[DSH_ANNOTATIONS_V1:')
  expect('beginSubmission' in session).toBe(false)
})
it('历史编号跨缓存恢复，引用按先后解析，未挂载原文只提示；会话销毁恢复投影', async () => {
  const payload = historyPayload()
  const nodes = [{ key: 'user', kind: 'user', anchorSeq: 2, data: { content: [{ type: 'text', text: encodePayload(payload) }] } },
    { key: 'reply', kind: 'assistant-step', anchorSeq: 3, data: {} }]
  const { face, effects, session, begin } = fixture(true, nodes)
  expect(face.add(selector)!.number).toBe(2)
  expect(face.reference(1, 'reply')!.quote).toBe('原文')
  const locate = vi.fn(); window.addEventListener('dca:locate', locate)
  try {
    face.cite(1, 'reply')
    expect(locate).not.toHaveBeenCalled()
    expect(face.notice.getSnapshot()).toContain('未显示')
    const source = document.createElement('div'); source.dataset.dcaSession = 's1'; source.dataset.dcaNodeKey = 'source'; document.body.append(source)
    face.cite(1, 'reply')
    expect(locate).toHaveBeenCalledTimes(1)
    expect((locate.mock.calls[0]![0] as CustomEvent).detail.note.id).toBe(payload.annotations[0]!.id)
    effects.forEach(fn => fn())
    expect(session.beginSubmission).toBe(begin)
    await Promise.resolve()
  } finally { window.removeEventListener('dca:locate', locate) }
})
