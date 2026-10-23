// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { apply } from '../src/annotations/client.jsx'
import { decodeText } from '../src/annotations/core.js'
import { SelectionAsk } from '../src/client/SelectionAsk'
import { BubbleStore } from '../src/client/bubbles'
import { translate } from '../src/locales'

it.each(['button', 'enter'])('批注通过 %s 保存后聚焦主输入框，保留草稿、引用和旁问功能', async method => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  Range.prototype.getBoundingClientRect = () => ({ left: 100, top: 150, bottom: 170, right: 250, width: 150, height: 20 } as DOMRect)
  Range.prototype.getClientRects = () => [Range.prototype.getBoundingClientRect()] as unknown as DOMRectList
  HTMLElement.prototype.scrollIntoView = () => {}
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  vi.stubGlobal('CSS', { escape: (s: string) => s })
  HTMLElement.prototype.scrollBy = () => {}
  localStorage.clear()
  const cleanups: (() => void)[] = []
  const effect = (fn: () => (() => void)) => { const off = fn(); cleanups.push(off); return off }
  const state = { phase: 'idle', draft: '已有主对话草稿', draftRev: 0, occurrences: [] as any[] }
  const composer = document.createElement('textarea'); document.body.append(composer)
  const focus = vi.fn(() => composer.focus())
  const subscribe = () => () => {}
  let source: any
  const binding = { ctx: { effect, bail: (_ctx: unknown, event: string, value: any) => {
    if (event === 'slash/input-insert-reference') state.occurrences.push({ ...value.reference, offset: 0, length: 1 })
    return true
  } }, session: { projections: { faceOf: () => ({ getSnapshot: () => ({}), subscribe }) } } }
  const entry = { options: { key: 'assistant-step', priority: 0 }, component: () => React.createElement('p', null, '用于批注与旁问的原文') }
  const ctx = { effect, on: () => () => {}, sessions: { binding: () => binding },
    conversation: { input: { for: () => ({ state: { getSnapshot: () => state, subscribe }, focus }) } },
    uiConversation: { binding: () => ({ target: () => ({ getSnapshot: () => ({ nodes: new Map() }), subscribe }) }) },
    inputTriggers: { registerSource: (value: any) => { source = value; return () => {} } },
    slots: { entries: (name: string) => name === 'conversation.chat.node' ? [entry] : [], inject: (_name: string, fn: () => void) => fn(), register: () => () => {} } }
  const run = vi.fn(async () => ({ kind: 'success' as const, text: '旁问回答' }))
  const store = new BubbleStore({ run, close: async () => ({ kind: 'success', text: '' }) })
  const t = translate()
  let btwEnabled = true
  const btwListeners = new Set<() => void>()
  const setBtwEnabled = async (value: boolean) => {
    await act(async () => { btwEnabled = value; for (const listener of btwListeners) listener() })
  }
  apply(ctx, { store, t, isSubagent: () => false, getSnapshot: () => btwEnabled,
    subscribe: (listener: () => void) => { btwListeners.add(listener); return () => btwListeners.delete(listener) } })
  const scope = document.createElement('div'); scope.dataset.conversationScroll = ''; document.body.append(scope)
  const root = createRoot(scope)
  try {
    await act(async () => root.render(React.createElement(React.Fragment, null,
      React.createElement(entry.component as any, { node: { key: 'a1' }, sessionId: 's1' }),
      React.createElement(SelectionAsk, { store, t, sessionId: 's1' }))))
    const select = async () => {
      const p = scope.querySelector('p')!
      const range = document.createRange(); range.selectNodeContents(p)
      window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range)
      await act(async () => {
        p.dispatchEvent(new Event('pointerup', { bubbles: true }))
        p.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
        await new Promise(resolve => setTimeout(resolve, 5))
      })
    }
    await select()
    expect(document.querySelectorAll('.dca-menu')).toHaveLength(1)
    expect(document.querySelectorAll('.btw-selection-menu')).toHaveLength(0)
    expect(document.querySelector('.dca-menu')!.textContent).toBe('添加到对话旁问')
    await act(async () => (document.querySelector('.dca-menu button') as HTMLButtonElement).click())
    const editor = document.querySelector('.dca-editor textarea') as HTMLTextAreaElement
    expect(editor).not.toBeNull()
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(editor, '我的评论')
      editor.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const occurrence = { ...state.occurrences[0] }
    if (method === 'enter') {
      await act(async () => editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true })))
      expect(focus).not.toHaveBeenCalled()
      expect(document.querySelector('.dca-editor')).not.toBeNull()
    }
    await act(async () => {
      if (method === 'button') (document.querySelector('.dca-save') as HTMLButtonElement).click()
      else editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })
    expect(focus).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(composer)
    expect(document.querySelector('.dca-editor')).toBeNull()
    expect(state.draft).toBe('已有主对话草稿')
    expect(state.occurrences).toEqual([occurrence])
    expect(run).not.toHaveBeenCalled()
    const encoded = await source.codec.serialize(state.occurrences[0].ref, new AbortController().signal)
    const note = decodeText(encoded).payloads[0].annotations[0]
    expect(note.quote).toBe('用于批注与旁问的原文')
    expect(note.comment).toBe('我的评论')
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    await act(async () => window.dispatchEvent(new CustomEvent('dca:locate', { detail: { sessionId: 's1', note: { ...note, status: 'sent' } } })))
    expect(window.getSelection()!.toString()).toBe(note.quote)
    await select()
    await act(async () => (document.querySelectorAll('.dca-menu button')[1] as HTMLButtonElement).click())
    window.getSelection()!.removeAllRanges()
    expect(document.querySelector('.btw-reference blockquote')!.textContent).toBe(note.quote)
    await setBtwEnabled(false)
    expect(document.querySelector('.btw-selection-modal')).toBeNull()
    await setBtwEnabled(true)
    expect(document.querySelector('.btw-selection-modal')).toBeNull()
    expect(run).not.toHaveBeenCalled()
    await select()
    await act(async () => (document.querySelectorAll('.dca-menu button')[1] as HTMLButtonElement).click())
    window.getSelection()!.removeAllRanges()
    expect(document.querySelector('.btw-reference blockquote')!.textContent).toBe(note.quote)
    const explain = [...document.querySelectorAll('button')].find(b => b.textContent === t('selection.explain'))!
    await act(async () => explain.click())
    expect(run).toHaveBeenCalledWith('s1', expect.any(String), t('selection.explain'), expect.any(AbortSignal), note.quote)
    expect(document.querySelector('.btw-selection-modal')).toBeNull()
  } finally {
    await act(async () => root.unmount()); scope.remove(); composer.remove()
    cleanups.reverse().forEach(fn => fn()); await store.dispose(); vi.unstubAllGlobals()
  }
})

it('回复内批注链接悬停预览、点击回跳，不导航外网或启动旁问', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  Range.prototype.getBoundingClientRect = () => ({ left: 10, top: 30, bottom: 50, right: 100, width: 90, height: 20 } as DOMRect)
  Range.prototype.getClientRects = () => [Range.prototype.getBoundingClientRect()] as unknown as DOMRectList
  HTMLElement.prototype.scrollBy = () => {}
  const { AnnotationStore, encodePayload } = await import('../src/annotations/core.js')
  const data = new Map(), notes = new AnnotationStore({ getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v) }, 's1')
  const note = notes.add({ nodeKey: 'original', quote: '引用原文', start: 0, end: 4, prefix: '', suffix: '' })
  notes.edit(note.id, { comment: '需要核对' })
  const payload = notes.prepare(notes.getSnapshot().ref)
  localStorage.clear()
  const effects: (() => void)[] = [], subscribe = () => () => {}
  const effect = (factory: () => (() => void)) => { const off = factory(); effects.push(off); return off }
  const nodes = new Map([
    ['original', { key: 'original', kind: 'assistant-step', anchorSeq: 1, data: {} }],
    ['user', { key: 'user', kind: 'user', anchorSeq: 2, data: { content: [{ type: 'text', text: encodePayload(payload) }] } }],
    ['reply', { key: 'reply', kind: 'assistant-step', anchorSeq: 3, data: {} }],
  ])
  const binding = { ctx: { effect }, session: { projections: { faceOf: () => ({ getSnapshot: () => ({}), subscribe }) } } }
  const entry = { options: { key: 'assistant-step', priority: 0 }, component: ({ node }: any) => node.key === 'original'
    ? React.createElement('p', null, '引用原文')
    : React.createElement('a', { href: 'https://dsh-annotations.invalid/1', target: '_blank' }, '注释 1') }
  const state = { phase: 'idle', draft: '主对话草稿', occurrences: [] }
  const ctx = { effect, on: () => () => {}, sessions: { binding: () => binding },
    conversation: { input: { for: () => ({ state: { getSnapshot: () => state, subscribe } }) } },
    uiConversation: { binding: () => ({ target: () => ({ getSnapshot: () => ({ nodes }), subscribe }) }) },
    inputTriggers: { registerSource: () => () => {} },
    slots: { entries: (name: string) => name === 'conversation.chat.node' ? [entry] : [], inject: (_: string, fn: () => void) => fn(), register: () => () => {} } }
  const run = vi.fn(), btw = { t: translate(), store: new BubbleStore({ run, close: async () => ({ kind: 'success', text: '' }) }), isSubagent: () => false }
  apply(ctx, btw)
  const mount = document.createElement('div'); mount.dataset.conversationScroll = ''; document.body.append(mount); const root = createRoot(mount)
  try {
    await act(async () => root.render(React.createElement(React.Fragment, null,
      React.createElement(entry.component as any, { node: nodes.get('original'), sessionId: 's1' }),
      React.createElement(entry.component as any, { node: nodes.get('reply'), sessionId: 's1' }))))
    const link = mount.querySelector('a')!
    expect(link.hasAttribute('target')).toBe(false)
    expect(link.getAttribute('aria-label')).toBe('注释 1：引用原文')
    await act(async () => { link.dispatchEvent(new MouseEvent('pointerover', { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 520)) })
    expect(document.querySelector('.dca-citation-preview')!.textContent).toContain('引用原文')
    expect(document.querySelector('.dca-citation-preview')!.textContent).toContain('需要核对')
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    await act(async () => { link.dispatchEvent(click) })
    expect(click.defaultPrevented).toBe(true)
    expect(window.getSelection()!.toString()).toBe('引用原文')
    expect(document.querySelector('.dca-citation-preview')).toBeNull()
    expect(state.draft).toBe('主对话草稿')
    expect(run).not.toHaveBeenCalled()
  } finally {
    await act(async () => root.unmount()); mount.remove(); effects.reverse().forEach(fn => fn())
    await btw.store.dispose(); localStorage.clear(); vi.unstubAllGlobals()
  }
})

it('第三入口可选联动侧聊，连续追加且不触发旁问或主输入框回焦', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  Range.prototype.getBoundingClientRect = () => ({ left: 100, top: 150, bottom: 170, right: 250, width: 150, height: 20 } as DOMRect)
  Range.prototype.getClientRects = () => [Range.prototype.getBoundingClientRect()] as unknown as DOMRectList
  HTMLElement.prototype.scrollIntoView = () => {}
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  vi.stubGlobal('CSS', { escape: (s: string) => s })
  HTMLElement.prototype.scrollBy = () => {}
  localStorage.clear()
  const cleanups: (() => void)[] = []
  const effect = (fn: () => (() => void)) => { const off = fn(); cleanups.push(off); return off }
  const state = { phase: 'idle', draft: '已有主对话草稿', draftRev: 0, occurrences: [] as any[] }
  const composer = document.createElement('textarea'); document.body.append(composer)
  const focus = vi.fn(() => composer.focus())
  const subscribe = () => () => {}
  let source: any
  const binding = { ctx: { effect, bail: (_ctx: unknown, event: string, value: any) => {
    if (event === 'slash/input-insert-reference') state.occurrences.push({ ...value.reference, offset: 0, length: 1 })
    return true
  } }, session: { projections: { faceOf: () => ({ getSnapshot: () => ({}), subscribe }) } } }
  const entry = { options: { key: 'assistant-step', priority: 0 }, component: () => React.createElement('p', null, '用于批注与旁问的原文') }
  const sideInput = document.createElement('textarea'); sideInput.value = '已有侧聊草稿'; document.body.append(sideInput)
  const appendSidechatDraft = vi.fn(({ text }: { text: string }) => { sideInput.value += '\n\n' + text; sideInput.focus(); sideInput.setSelectionRange(sideInput.value.length, sideInput.value.length) })
  let connect: (scope: any) => void = () => {}
  const ctx = { inject: (_deps: string[], fn: (scope: any) => void) => { connect = fn }, effect, on: () => () => {}, sessions: { binding: () => binding },
    conversation: { input: { for: () => ({ state: { getSnapshot: () => state, subscribe }, focus }) } },
    uiConversation: { binding: () => ({ target: () => ({ getSnapshot: () => ({ nodes: new Map() }), subscribe }) }) },
    inputTriggers: { registerSource: (value: any) => { source = value; return () => {} } },
    slots: { entries: (name: string) => name === 'conversation.chat.node' ? [entry] : [], inject: (_name: string, fn: () => void) => fn(), register: () => () => {} } }
  const run = vi.fn(async () => ({ kind: 'success' as const, text: '旁问回答' }))
  const store = new BubbleStore({ run, close: async () => ({ kind: 'success', text: '' }) })
  const t = translate()
  let btwEnabled = true
  const btwListeners = new Set<() => void>()
  const setBtwEnabled = async (value: boolean) => {
    await act(async () => { btwEnabled = value; for (const listener of btwListeners) listener() })
  }
  apply(ctx, { store, t, isSubagent: () => false, getSnapshot: () => btwEnabled,
    subscribe: (listener: () => void) => { btwListeners.add(listener); return () => btwListeners.delete(listener) } })
  const scope = document.createElement('div'); scope.dataset.conversationScroll = ''; document.body.append(scope)
  const root = createRoot(scope)
  try {
    await act(async () => root.render(React.createElement(React.Fragment, null,
      React.createElement(entry.component as any, { node: { key: 'a1' }, sessionId: 's1' }),
      React.createElement(SelectionAsk, { store, t, sessionId: 's1' }))))
    const select = async () => {
      const p = scope.querySelector('p')!
      const range = document.createRange(); range.selectNodeContents(p)
      window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range)
      await act(async () => {
        p.dispatchEvent(new Event('pointerup', { bubbles: true }))
        p.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
        await new Promise(resolve => setTimeout(resolve, 5))
      })
    }
    await select()
    expect(document.querySelector('.dca-menu')!.textContent).toBe('添加到对话旁问')
    // Older Sidebar version must not expose an action it cannot fulfill.
    await act(async () => connect({ get: () => ({}), effect }))
    expect(document.querySelector('.dca-menu')!.textContent).toBe('添加到对话旁问')
    const releases: (() => void)[] = []
    await act(async () => connect({ get: () => ({ appendSidechatDraft }), effect: (fn: () => () => void) => releases.push(fn()) }))
    expect(document.querySelector('.dca-menu')!.textContent).toBe('添加到对话旁问加入到侧边对话')
    for (let i = 0; i < 2; i++) {
      await select()
      await act(async () => ([...document.querySelectorAll('.dca-menu button')].find(b => b.textContent === '加入到侧边对话') as HTMLButtonElement).click())
      expect(document.activeElement).toBe(sideInput)
      expect(sideInput.selectionStart).toBe(sideInput.value.length)
    }
    expect(appendSidechatDraft).toHaveBeenCalledTimes(2)
    expect(appendSidechatDraft).toHaveBeenLastCalledWith({ sessionId: 's1', text: '用于批注与旁问的原文', requestId: expect.any(String) })
    expect(sideInput.value).toBe('已有侧聊草稿\n\n用于批注与旁问的原文\n\n用于批注与旁问的原文')
    expect(focus).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
    expect(state.draft).toBe('已有主对话草稿')
    expect(state.occurrences).toEqual([])
    await setBtwEnabled(false)
    await select()
    expect(document.querySelector('.dca-menu')!.textContent).toBe('添加到对话加入到侧边对话')
    // A rejected append is visible and must not redirect focus to main input.
    appendSidechatDraft.mockImplementationOnce(() => { throw new Error('侧边对话已关闭') })
    await act(async () => ([...document.querySelectorAll('.dca-menu button')].find(b => b.textContent === '加入到侧边对话') as HTMLButtonElement).click())
    expect(document.querySelector('[role="alert"]')!.textContent).toContain('侧边对话已关闭')
    expect(focus).not.toHaveBeenCalled()
    await act(async () => releases.reverse().forEach(fn => fn()))
    await select()
    expect(document.querySelector('.dca-menu')!.textContent).toBe('添加到对话')
  } finally {
    await act(async () => root.unmount()); scope.remove(); composer.remove(); sideInput.remove()
    cleanups.reverse().forEach(fn => fn()); await store.dispose(); vi.unstubAllGlobals()
  }
})
