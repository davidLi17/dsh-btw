import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { Shortcuts, ShortcutFixedInput, ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import { EffortController } from './effort-controller'
import { NS } from '../locales'

/** Native fixed input has already passed local control and IME arbitration. */
export function installEffortShortcuts(shortcuts: Pick<Shortcuts, 'registerFixed' | 'observeFixedInput'>, controller: EffortController,
  label: (direction: 'up' | 'down') => string): () => void {
  const disposers: (() => void)[] = []
  try {
    for (const direction of ['up', 'down'] as const) {
      disposers.push(shortcuts.registerFixed({ id: `btw.effort.${direction}` as ShortcutCommandId,
        label: () => label(direction), keys: ['Shift', direction === 'up' ? '↑' : '↓'],
        bindings: [{ code: direction === 'up' ? 'ArrowUp' : 'ArrowDown', modifiers: ['shift'] }], group: 'input' }))
    }
    disposers.push(shortcuts.observeFixedInput((input: ShortcutFixedInput) => {
      if (input.type === 'reset') { controller.reset(); return }
      const { gesture: g, context } = input
      if (!g.shift || g.alt || g.control || g.meta || g.secondCode || g.composing || g.defaultPrevented
        || (g.code !== 'ArrowUp' && g.code !== 'ArrowDown') || context.region !== 'editable' || context.modal !== null) return
      const composer = context.target?.closest<HTMLElement>('[data-composer-input]')
      if (!composer || composer.getAttribute('contenteditable') === 'false' || composer.hasAttribute('data-composer-composing')) return
      const document = composer.ownerDocument
      if (!composer.contains(document.activeElement)) return
      // Native and Codex selectors portal menus outside the composer. Expanded popup owners
      // also cover the Codex model pane whose outer surface has role=group.
      if (document.querySelector('[role="menu"], [role="listbox"], [aria-haspopup="menu"][aria-expanded="true"], [aria-haspopup="listbox"][aria-expanded="true"]')) return
      const sessionId = composer.closest<HTMLElement>('[data-conversation-session]')?.dataset.conversationSession
      if (sessionId && controller.move(sessionId, g.code === 'ArrowUp' ? 1 : -1)) input.consume()
    }))
  } catch (error) {
    disposers.reverse().forEach(dispose => dispose())
    controller.dispose()
    throw error
  }
  return () => { disposers.reverse().forEach(dispose => dispose()); controller.dispose() }
}

/** Optional service scope: missing host capabilities never disable BTW or annotations. */
export function apply(ctx: Context): void {
  ctx.inject(['shortcuts', 'modelDirectories'], scope => {
    if (typeof scope.shortcuts.registerFixed !== 'function' || typeof scope.shortcuts.observeFixedInput !== 'function'
      || typeof scope.modelDirectories.directoryFor !== 'function') return
    const t = scope.locale.bind(NS)
    scope.effect(() => installEffortShortcuts(scope.shortcuts,
      new EffortController(id => scope.modelDirectories.directoryFor(id as SessionId)),
      direction => t(direction === 'up' ? 'effort.up' : 'effort.down')))
  })
}
