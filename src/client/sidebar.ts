import type { Context } from '@deepseek-ai/cordis'
import { useEffect, useSyncExternalStore } from 'react'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionInputResolver } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { CHILD_COMMAND, type SideChildAddress, type SideResult } from '../shared'
import type { BtwTranslate } from '../locales'

/** Structural public host faces; no runtime sidebar dependency or second tab registration. */
export interface NativeSidebar {
  mounted: { getSnapshot(): string | undefined; subscribe?(listener: () => void): () => void }
  openResource(address: string, options: { kind: 'subagentchat'; preferNewPane: true; revealIfOpened: true }): void
  active?(): { contentId: string } | undefined
  isExpanded?(): boolean
}
export interface NativeSidebarTabs {
  get(kind: string): unknown
  subscribe?(listener: () => void): () => void
}
type FocusRequest = SideChildAddress & { resource: string }
type SidebarSnapshot = { available: boolean; focus?: FocusRequest }
type Execute = (session: string, line: string, signal?: AbortSignal) => Promise<SideResult>

export function subagentChatAddress(address: SideChildAddress): string {
  const query = new URLSearchParams({ parent: address.parentSessionId, mode: address.mode })
  return `dsh-resource://subagentchat/session/${encodeURIComponent(address.childSessionId)}?${query}`
}

/** Only resolve an existing request and reveal the native, continuable conversation. */
export function createSidebarBridge(sessions: ISessions, execute: Execute, t: BtwTranslate, input: Pick<SessionInputResolver, 'for'>) {
  let sidebar: NativeSidebar | undefined
  let tabs: NativeSidebarTabs | undefined
  let snapshot: SidebarSnapshot = { available: false }
  const listeners = new Set<() => void>()
  const publish = (next: SidebarSnapshot) => {
    snapshot = next
    for (const listener of listeners) listener()
  }
  const available = () => typeof sidebar?.openResource === 'function'
    && typeof sidebar.mounted?.getSnapshot === 'function'
    && Boolean(tabs?.get?.('subagentchat'))
  const refresh = () => {
    const ready = available()
    const focus = snapshot.focus && ready && sidebar?.mounted.getSnapshot() === snapshot.focus.parentSessionId ? snapshot.focus : undefined
    if (ready !== snapshot.available || focus !== snapshot.focus) publish({ available: ready, ...(focus ? { focus } : {}) })
  }
  const requireParent = (parent: string) => {
    if (!available()) throw new Error(t('error.sidebarUnavailable'))
    if (sidebar!.mounted.getSnapshot() !== parent) throw new Error(t('error.sidebarSessionChanged'))
    return sidebar!
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    attach(nextSidebar: NativeSidebar, nextTabs: NativeSidebarTabs): () => void {
      sidebar = nextSidebar
      tabs = nextTabs
      const offTabs = tabs.subscribe?.(refresh)
      const offMounted = sidebar.mounted?.subscribe?.(refresh)
      refresh()
      return () => {
        offTabs?.()
        offMounted?.()
        if (sidebar !== nextSidebar) return
        sidebar = undefined
        tabs = undefined
        publish({ available: false })
      }
    },
    async openInSidebar(parentSessionId: string, requestId: string, signal: AbortSignal): Promise<void> {
      if (signal.aborted) return
      requireParent(parentSessionId)
      // This command only awaits the original admission. It never reruns the question.
      const result = await execute(parentSessionId, `/${CHILD_COMMAND} ${requestId}`, signal)
      if (signal.aborted) return
      if (result.kind === 'error') throw new Error(result.text || t('error.childUnavailable'))
      let address: SideChildAddress
      try {
        const value: unknown = JSON.parse(result.text)
        if (!value || typeof value !== 'object') throw new Error()
        const candidate = value as Partial<SideChildAddress>
        if (candidate.parentSessionId !== parentSessionId || candidate.mode !== 'continuable'
          || typeof candidate.childSessionId !== 'string' || !candidate.childSessionId.trim()
          || candidate.childSessionId === parentSessionId) throw new Error()
        address = candidate as SideChildAddress
      } catch { throw new Error(t('error.childUnavailable')) }
      // Navigation can change while the read-only command waits for child startup.
      const target = requireParent(parentSessionId)
      const resource = subagentChatAddress(address)
      try { target.openResource(resource, { kind: 'subagentchat', preferNewPane: true, revealIfOpened: true }) }
      catch (error) { throw new Error(`${t('error.sidebarOpen')} ${error instanceof Error ? error.message : String(error)}`) }
      publish({ available: true, focus: { ...address, resource } })
    },
    /** Called from the child's mounted input dock, never a document-wide editor selector. */
    focusComposer(sessionId: string, request: FocusRequest): void {
      if (snapshot.focus !== request || request.childSessionId !== sessionId) return
      const current = sidebar
      const visible = current?.mounted.getSnapshot() === request.parentSessionId
        && current.active?.()?.contentId === request.resource && current.isExpanded?.() === true
      publish({ available: available() })
      if (!visible) return
      const scope = sessions.scope(sessionId as SessionId)
      if (!scope) return
      // Public focus preserves the native draft, reference chips, images, and stored caret.
      // The host exposes no public selection-to-end method; do not rewrite the draft.
      try { input.for(scope).focus() }
      catch { /* Navigation can dispose the retained scope; never recreate or replace its draft. */ }
    },
  }
}
export type SidebarBridge = ReturnType<typeof createSidebarBridge>

export function SidebarComposerFocus({ bridge, sessionId }: { bridge: SidebarBridge; sessionId: string }): null {
  const { focus } = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot, bridge.getSnapshot)
  useEffect(() => {
    if (!focus || focus.childSessionId !== sessionId) return
    let mounted = true
    // All sibling input effects mount before this microtask; no timer can steal later focus.
    queueMicrotask(() => { if (mounted) bridge.focusComposer(sessionId, focus) })
    return () => { mounted = false }
  }, [bridge, focus, sessionId])
  return null
}

export function mountSidebarBridge(ctx: Context, bridge: SidebarBridge): void {
  if (typeof ctx.inject !== 'function') return
  ctx.inject(['sidebarRight', 'sidebarRightTabs'], scope => {
    const sidebar = scope.get('sidebarRight') as NativeSidebar
    const tabs = scope.get('sidebarRightTabs') as NativeSidebarTabs
    scope.effect(() => bridge.attach(sidebar, tabs))
  })
}
