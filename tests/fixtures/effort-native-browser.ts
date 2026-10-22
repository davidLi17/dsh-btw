// Isolated integration fixture, not a complete DSH application or Desktop bridge.
// Browser globals and host module-loader registrations are intentionally dynamic.
// @ts-nocheck
import * as cordis from '@deepseek-ai/cordis'
import * as store from '@deepseek-ai/dsh-client-store'
import { observeComposition, modalSelector } from 'host-composition-slice'
import {
  createEditor, $getRoot, $createParagraphNode, $createTextNode,
  KEY_ARROW_UP_COMMAND, KEY_ARROW_DOWN_COMMAND, COMMAND_PRIORITY_CRITICAL,
} from 'lexical'
import { registerPlainText } from '@lexical/plain-text'
import { installEffortShortcuts } from '../../src/client/effort-shortcuts'
import { EffortController } from '../../src/client/effort-controller'

const modules = {
  '@deepseek-ai/cordis': cordis,
  '@deepseek-ai/dsh-client-store': store,
  '@deepseek-ai/dsh-client-ui-primitives': { observeComposition, modalSelector },
}
window.__ModuleLoader__ = {
  load({ id, factory }) { modules[id] = factory(dependency => modules[dependency]) },
}
window.setup = () => {
  const ctx = new cordis.Context()
  ctx.provide('locale', { subscribe: () => () => {} })
  const service = new modules['@deepseek-ai/dsh-client-shortcuts'](ctx)
  const root = document.querySelector('[data-composer-input]')
  const editor = createEditor({ namespace: 'dsh-composer', onError: error => { throw error } })
  registerPlainText(editor)
  editor.setRootElement(root)
  window.menu = false
  // Explicit local menu ownership fixture, not the full host composer keymap.
  for (const command of [KEY_ARROW_UP_COMMAND, KEY_ARROW_DOWN_COMMAND]) {
    editor.registerCommand(command, event => {
      if (!window.menu) return false
      event.preventDefault()
      return true
    }, COMMAND_PRIORITY_CRITICAL)
  }
  const updateOptions = { discrete: true, tag: 'skip-scroll-into-view' }
  editor.update(() => {
    $getRoot().append($createParagraphNode().append($createTextNode('first line\nsecond line\nthird line')))
    $getRoot().getFirstChild().getFirstChild().select(15, 15)
  }, updateOptions)
  const calls = []
  let state = {
    status: 'ready', routable: true, pending: null,
    current: { provider: 'test', model: 'test', reasoningEffort: 'medium' },
    groups: [{ id: 'test', models: [{ id: 'test', reasoning: {
      efforts: [{ id: 'low' }, { id: 'medium' }, { id: 'high' }], defaultEffort: 'medium',
    } }] }],
  }
  const listeners = new Set()
  const directory = {
    store: {
      getSnapshot: () => state,
      subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    },
    select: async target => {
      calls.push(target)
      state = { ...state, current: target }
      listeners.forEach(listener => listener())
      return { ok: true }
    },
  }
  const controller = new EffortController(() => directory)
  const off = installEffortShortcuts(service, controller, direction => direction)
  window.nativeHarness = {
    off, editor, service, calls, ctx, root,
    position: () => editor.update(() => {
      $getRoot().getFirstChild().getFirstChild().select(15, 15)
    }, updateOptions),
    read: () => ({
      calls: [...calls], text: root.textContent, active: document.activeElement === root,
      anchor: window.getSelection().anchorOffset, focus: window.getSelection().focusOffset,
      selected: window.getSelection().toString(),
    }),
  }
}
