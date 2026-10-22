// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import type { Shortcuts, ShortcutFixedInput, ShortcutFixedCommand } from '@deepseek-ai/dsh-client-shortcuts/client'
import { installEffortShortcuts } from '../src/client/effort-shortcuts'
import { EffortController } from '../src/client/effort-controller'

function setup() {
  document.body.innerHTML = '<section data-conversation-session="session-a"><div data-composer-input contenteditable="true" tabindex="0">a draft</div></section><textarea id="annotation"></textarea>'
  const composer = document.querySelector<HTMLElement>('[data-composer-input]')!
  composer.focus()
  const commands: ShortcutFixedCommand[] = []
  const removed: string[] = []
  let listener: (input: ShortcutFixedInput) => void = () => {}
  const shortcuts: Pick<Shortcuts, 'registerFixed' | 'observeFixedInput'> = {
    registerFixed: command => { commands.push(command); return () => { removed.push(command.id) } },
    observeFixedInput: fn => { listener = fn; return () => { listener = () => {}; removed.push('listener') } },
  }
  const controller = new EffortController(() => { throw Error('unused') })
  const move = vi.spyOn(controller, 'move').mockReturnValue(true)
  const dispose = vi.spyOn(controller, 'dispose')
  const reset = vi.spyOn(controller, 'reset')
  const off = installEffortShortcuts(shortcuts, controller, direction => direction)
  const send = (overrides: Partial<Extract<ShortcutFixedInput, { type: 'keydown' }>> = {}) => {
    const input = { type: 'keydown' as const, context: { region: 'editable' as const, modal: null, target: composer },
      gesture: { code: 'ArrowUp', control: false, alt: false, shift: true, meta: false, repeat: false, composing: false, defaultPrevented: false }, consume: vi.fn(), ...overrides }
    listener(input); return input
  }
  return { composer, commands, removed, move, dispose, reset, send, off, resetInput: () => listener({ type: 'reset' }) }
}
afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks() })

it('registers native fixed actions and consumes only valid composer gestures without modifying draft/caret/focus', () => {
  const s = setup()
  const range = document.createRange(); range.setStart(s.composer.firstChild!, 2); range.collapse(true)
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range)
  const input = s.send()
  expect(s.move).toHaveBeenCalledWith('session-a', 1); expect(input.consume).toHaveBeenCalledOnce()
  expect(document.activeElement).toBe(s.composer); expect(s.composer.textContent).toBe('a draft')
  expect(window.getSelection()!.anchorOffset).toBe(2)
  expect(s.commands.map(c => c.id)).toEqual(['btw.effort.up', 'btw.effort.down'])
  s.send({ gesture: { ...input.gesture, code: 'ArrowDown', repeat: true } })
  expect(s.move).toHaveBeenLastCalledWith('session-a', -1)
  s.off(); expect(s.removed).toHaveLength(3); expect(s.dispose).toHaveBeenCalledOnce()
  s.send(); expect(s.move).toHaveBeenCalledTimes(2)
})
it.each(['composing', 'defaultPrevented', 'alt', 'control', 'meta'] as const)('passes %s input', field => {
  const s = setup(); const base = s.send(); s.move.mockClear()
  expect(s.send({ gesture: { ...base.gesture, [field]: true } }).consume).not.toHaveBeenCalled()
  expect(s.move).not.toHaveBeenCalled(); s.off()
})
it('leaves search, annotations, BTW, terminal, modal and unfocused composers alone', () => {
  const s = setup(); const annotation = document.querySelector('textarea')!
  for (const context of [
    { region: 'editable' as const, modal: null, target: annotation },
    { region: 'terminal' as const, modal: null, target: s.composer },
    { region: 'editable' as const, modal: 'dialog', target: s.composer },
  ]) expect(s.send({ context }).consume).not.toHaveBeenCalled()
  annotation.focus(); expect(s.send().consume).not.toHaveBeenCalled()
  expect(s.move).not.toHaveBeenCalled(); s.off()
})
it.each(['<div role="menu"></div>', '<div role="listbox"></div>', '<button aria-haspopup="menu" aria-expanded="true"></button>'])('defers to open native/Codex menu: %s', markup => {
  const s = setup(); document.body.insertAdjacentHTML('beforeend', markup)
  expect(s.send().consume).not.toHaveBeenCalled(); expect(s.move).not.toHaveBeenCalled(); s.off()
})
it('leaves unsupported catalogs and composing/read-only/no-session editors native', () => {
  const s = setup(); s.move.mockReturnValue(false)
  expect(s.send().consume).not.toHaveBeenCalled()
  s.move.mockClear(); s.composer.setAttribute('data-composer-composing', '')
  s.send(); s.composer.removeAttribute('data-composer-composing')
  s.composer.setAttribute('contenteditable', 'false'); s.send()
  s.composer.setAttribute('contenteditable', 'true'); s.composer.parentElement!.removeAttribute('data-conversation-session'); s.send()
  expect(s.move).not.toHaveBeenCalled(); s.resetInput(); expect(s.reset).toHaveBeenCalledOnce(); s.off()
})
it('cleans partial registrations if host registration fails', () => {
  const off = vi.fn(); const controller = new EffortController(() => { throw Error('unused') })
  const dispose = vi.spyOn(controller, 'dispose'); let n = 0
  expect(() => installEffortShortcuts({ registerFixed: () => { if (n++) throw Error('duplicate'); return off }, observeFixedInput: vi.fn() }, controller, () => 'label')).toThrow('duplicate')
  expect(off).toHaveBeenCalledOnce(); expect(dispose).toHaveBeenCalledOnce()
})
