/**
 * Real installed ShortcutsService + real Lexical DOM bubbling integration.
 * This is not full Desktop/Web acceptance: directory/RPC and local menu ownership
 * are fixtures, and jsdom has no browser-native selection/layout implementation.
 * The host composition guard is extracted verbatim to avoid importing unrelated
 * UI rendering packages. No shortcut dispatcher or Lexical implementation is mocked.
 */
import { expect, it } from 'vitest'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'

it('routes through installed host service after real Lexical, preserves editor state, and disposes cleanly', async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const primitives = await readFile(path.join(root, 'node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/index.js'), 'utf8')
  const start = primitives.indexOf('function observeComposition(document)')
  const end = primitives.indexOf('//#endregion', start)
  const modal = primitives.match(/^const modalSelector = .+;$/m)?.[0]
  assert(start !== -1 && end !== -1 && modal, 'Host composition export layout changed; review extraction')
  const built = await build({ entryPoints: [path.join(root, 'tests/fixtures/effort-native-browser.ts')], bundle: true,
    write: false, platform: 'browser', plugins: [{ name: 'real-host-composition', setup(builder) {
      builder.onResolve({ filter: /^host-composition-slice$/ }, () => ({ path: 'composition', namespace: 'host-slice' }))
      builder.onLoad({ filter: /.*/, namespace: 'host-slice' }, () => ({ contents: primitives.slice(start, end) + modal + '\nexport { observeComposition, modalSelector };', loader: 'js' }))
    } }] })
  const dom = new JSDOM('<section data-conversation-session="test"><div data-composer-input contenteditable="true" tabindex="0"></div></section><textarea id="other"></textarea>', { url: 'http://localhost', runScripts: 'dangerously', pretendToBeVisual: true })
  // Geometry is only supplied for Lexical scroll bookkeeping, not tested as layout.
  const range = dom.window.Range.prototype as Range & { getBoundingClientRect(): DOMRect }
  range.getBoundingClientRect = () => new dom.window.DOMRect()
  range.getClientRects = () => [] as unknown as DOMRectList
  const errors: unknown[] = []
  dom.window.addEventListener('error', event => errors.push(event.error))
  const evaluate = async <T>(fn: () => T): Promise<Awaited<T>> => JSON.parse(JSON.stringify(await dom.window.eval(`(${fn.toString()})()`)) ?? 'null')
  const press = (code: string, extra: KeyboardEventInit = {}) => {
    const event = new dom.window.KeyboardEvent('keydown', { key: code, code, shiftKey: true, bubbles: true, cancelable: true, ...extra })
    dom.window.document.activeElement!.dispatchEvent(event)
    return event.defaultPrevented
  }
  const tick = () => new Promise(resolve => setTimeout(resolve, 25))
  // The fixture is isolated inside the jsdom window; functions below execute there.
  const get = () => evaluate(() => (window as any).nativeHarness.read())
  try {
    dom.window.eval(built.outputFiles[0]!.text)
    dom.window.eval(await readFile(path.join(root, 'node_modules/@deepseek-ai/dsh-client-shortcuts/lib/client.js'), 'utf8'))
    await evaluate(() => { (window as any).setup(); const h = (window as any).nativeHarness; h.root.focus(); h.position() })
    await tick()
    const before = await get()
    expect(before.active).toBe(true)
    for (const [code, effort] of [['ArrowUp', 'high'], ['ArrowDown', 'medium']]) {
      expect(press(code!)).toBe(true); await tick()
      const after = await get()
      expect(after.calls.at(-1).reasoningEffort).toBe(effort)
      for (const key of ['text', 'active', 'anchor', 'focus', 'selected']) expect(after[key]).toEqual(before[key])
    }
    const baseline = (await get()).calls.length
    // Local Lexical command arbitration consumes the event before the window observer.
    await evaluate(() => { (window as any).menu = true })
    expect(press('ArrowUp')).toBe(true); await tick()
    expect((await get()).calls).toHaveLength(baseline)
    await evaluate(() => { (window as any).menu = false; document.body.insertAdjacentHTML('beforeend', '<div role="listbox" id="popup"></div>') })
    expect(press('ArrowDown')).toBe(false); await tick()
    expect((await get()).calls).toHaveLength(baseline)
    await evaluate(() => document.querySelector('#popup')!.remove())
    for (const extra of [{ isComposing: true }, { altKey: true }, { ctrlKey: true }, { metaKey: true }]) {
      expect(press('ArrowUp', extra)).toBe(false)
      expect((await get()).calls).toHaveLength(baseline)
    }
    await evaluate(() => (window as any).nativeHarness.root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })))
    expect(press('ArrowUp')).toBe(false); await tick()
    expect((await get()).calls).toHaveLength(baseline)
    await evaluate(() => { (window as any).nativeHarness.root.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })); (document.querySelector('#other') as HTMLElement).focus() })
    expect(press('ArrowUp')).toBe(false); await tick()
    expect((await get()).calls).toHaveLength(baseline)
    await evaluate(() => { const h = (window as any).nativeHarness; h.root.focus(); h.position(); h.off() })
    await tick()
    // Uncancelled DOM event is verified; native Shift-selection cannot be proved in jsdom.
    expect(press('ArrowUp')).toBe(false); await tick()
    expect((await get()).calls).toHaveLength(baseline)
    expect(await evaluate(() => (window as any).nativeHarness.service.fixedCatalog.getSnapshot().length)).toBe(0)
    expect(errors).toEqual([])
  } finally {
    await evaluate(() => (window as any).nativeHarness?.ctx.fiber.dispose().then(() => null))
    dom.window.close()
  }
}, 20_000)
