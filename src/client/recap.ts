import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-commands/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ClientSessionContext } from '@deepseek-ai/dsh-client-ui-input-trigger/client'

export const RECAP_PROMPT = '1. 对话主线 recap，整理其中信息。\n2. 给我对我最重要的信息。'

/** A native slash action, not a keystroke listener or a system-prompt section. */
export function applyRecap(ctx: Context): void {
  ctx.inject(['commandUi'], scope => {
    const commands = scope.get('commandUi')
    if (!commands?.register) return
    const sessions = scope.get('sessions') as unknown as ISessions
    let active = true
    const pending = new Set<() => void>()
    scope.effect(() => () => { active = false; for (const cancel of pending) cancel() })
    const inputFor = ({ sessionId }: ClientSessionContext) => {
      if (sessions.subagentAddress?.(sessionId)) return
      const actx = sessions.scope(sessionId)
      if (!actx) return
      return { actx, input: actx.conversation.input.for(actx) }
    }
    commands.register({
      name: 'recap',
      description: () => '回顾对话主线，提炼对我最重要的信息并发送',
      available: session => !!inputFor(session),
      ui: {
        kind: 'action',
        // Menu Enter may still be inside Lexical's update; edit after that commit.
        run: session => queueMicrotask(() => {
          if (!active) return
          const target = inputFor(session)
          if (!target) return
          const { actx, input } = target
          input.setDraft(RECAP_PROMPT)
          const revision = input.state.getSnapshot().draftRev
          let off = () => {}
          let cancelled = false
          const cancel = () => { cancelled = true; off(); pending.delete(cancel) }
          const check = () => {
            const state = input.state.getSnapshot()
            if (state.draftRev !== revision || state.draft !== RECAP_PROMPT) { cancel(); return }
            // Bare Enter is still in native adjudication; wait for its unlocked phase.
            if (state.phase !== 'plain') return
            off()
            queueMicrotask(() => {
              const current = input.state.getSnapshot()
              if (!cancelled && sessions.scope(session.sessionId) === actx
                && current.phase === 'plain' && current.draftRev === revision
                && current.draft === RECAP_PROMPT) {
                cancel()
                input.submit()
              } else cancel()
            })
          }
          pending.add(cancel)
          off = input.state.subscribe(check)
          check()
        }),
      },
    })
  })
}
