import type { Context } from '@deepseek-ai/cordis'

// Narrow structural face of the public experimental speech RPC (0.2.1-rc.2).
// No runtime import or duplicate Remote mounting: the native bundle owns it.
type Result<T> = { ok: true; value: T } | { ok: false; error: { message: string } }
export interface SpeechCatalog {
  selection: { providerId?: string; language?: string }
  providers: readonly { id: string; preparation: { phase: string } }[]
  maxAudioBytes: number
  maxDurationSeconds: number
}
export interface SpeechRemote {
  catalog(): Promise<Result<SpeechCatalog>>
  transcribe(request: { audioBase64: string; providerId?: string; language?: string }, signal?: AbortSignal): Promise<Result<{ text: string }>>
}
export interface VoiceService {
  remote: SpeechRemote
  openSettings?: () => void
}
export function createVoiceBridge() {
  let current: VoiceService | undefined
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    set(value: VoiceService | undefined) { current = value; for (const listener of listeners) listener() },
  }
}
export type VoiceBridge = ReturnType<typeof createVoiceBridge>
export function mountVoiceBridge(ctx: Context, bridge: VoiceBridge): void {
  if (typeof ctx.inject !== 'function') return
  ctx.inject(['remote.speech'], scope => {
    const remote = scope.get('remote.speech') as SpeechRemote
    const navigation = scope.get('pluginNavigation') as { openBundle(id: string): void } | undefined
    bridge.set({ remote, openSettings: navigation ? () => navigation.openBundle('@deepseek-ai/dsh-experimental-voice-input-bundle') : undefined })
    scope.effect(() => () => bridge.set(undefined))
  })
}
