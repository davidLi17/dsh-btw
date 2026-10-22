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
  apply(ctx, { store, t, isSubagent: () => false })
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
    const explain = [...document.querySelectorAll('button')].find(b => b.textContent === t('selection.explain'))!
    await act(async () => explain.click())
    expect(run).toHaveBeenCalledWith('s1', expect.any(String), t('selection.explain'), expect.any(AbortSignal), note.quote)
    expect(document.querySelector('.btw-selection-modal')).toBeNull()
  } finally {
    await act(async () => root.unmount()); scope.remove(); composer.remove()
    cleanups.reverse().forEach(fn => fn()); await store.dispose(); vi.unstubAllGlobals()
  }
})
