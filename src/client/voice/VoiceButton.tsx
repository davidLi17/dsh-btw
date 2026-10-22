import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Mic, Square } from 'lucide-react'
import type { BtwTranslate } from '../../locales'
import { MAX_QUESTION_LENGTH } from '../../shared'
import { Recording, audioBase64 } from './audio'
import type { SpeechCatalog, VoiceBridge, VoiceService } from './service'

type ActiveCapture = { abort: AbortController; recording?: Recording; timer?: ReturnType<typeof setTimeout>; span: ReturnType<DraftTarget['capture']>; catalog?: SpeechCatalog; phase: string }
export interface DraftTarget {
  capture(): { text: string; revision: number; start: number; end: number }
  insert(text: string, span: ReturnType<DraftTarget['capture']>): boolean
}
export function insertTranscript(text: string, span: ReturnType<DraftTarget['capture']>): { text: string; caret: number } | undefined {
  const next = span.text.slice(0, span.start) + text + span.text.slice(span.end)
  return next.length > MAX_QUESTION_LENGTH ? undefined : { text: next, caret: span.start + text.length }
}
export function VoiceButton({ bridge, ...props }: { bridge: VoiceBridge; target: DraftTarget; locked: boolean; onActiveChange(active: boolean): void; t: BtwTranslate }) {
  const service = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot, bridge.getSnapshot)
  return service ? <VoiceCapture key={serviceKey(service)} service={service} {...props} /> : null
}
const ids = new WeakMap<VoiceService, number>()
let nextId = 0
function serviceKey(service: VoiceService) { if (!ids.has(service)) ids.set(service, ++nextId); return ids.get(service) }

function VoiceCapture({ service, target, locked, onActiveChange, t }: { service: VoiceService; target: DraftTarget; locked: boolean; onActiveChange(active: boolean): void; t: BtwTranslate }) {
  const [phase, setPhase] = useState<'idle' | 'requesting' | 'recording' | 'transcribing'>('idle')
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState('')
  const [needsSetup, setNeedsSetup] = useState(false)
  const run = useRef<ActiveCapture>()
  const currentTarget = useRef(target); currentTarget.current = target
  const dispose = (capture?: Recording) => { void capture?.dispose().catch(() => {}) }
  const cancel = () => {
    const active = run.current; run.current = undefined
    if (active) { clearTimeout(active.timer); active.abort.abort(); dispose(active.recording) }
    setPhase('idle'); setMessage(''); setPending(''); setNeedsSetup(false)
  }
  useEffect(() => { onActiveChange(phase !== 'idle'); return () => onActiveChange(false) }, [phase, onActiveChange])
  useEffect(() => {
    const blur = () => { if (run.current?.phase === 'recording') cancel() }
    const hide = () => { if (document.hidden) cancel() }
    window.addEventListener('blur', blur); document.addEventListener('visibilitychange', hide)
    return () => {
      window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', hide)
      const active = run.current; run.current = undefined
      if (active) { clearTimeout(active.timer); active.abort.abort(); dispose(active.recording) }
    }
  }, [])
  const finish = async () => {
    const active = run.current
    if (!active?.recording || !active.catalog || active.phase !== 'recording') return
    active.phase = 'transcribing'; clearTimeout(active.timer); setPhase('transcribing')
    try {
      const audio = await active.recording.stop(active.catalog.maxDurationSeconds)
      if (run.current !== active) return
      if (audio.byteLength > active.catalog.maxAudioBytes) throw new Error(t('voice.tooLarge'))
      const result = await service.remote.transcribe({ audioBase64: audioBase64(audio), ...active.catalog.selection }, active.abort.signal)
      if (run.current !== active) return
      if (!result.ok) throw new Error(result.error.message)
      if (!result.value.text.trim()) { setMessage(t('voice.empty')); return }
      if (!currentTarget.current.insert(result.value.text, active.span)) {
        setPending(result.value.text); setMessage(t('voice.conflict'))
      }
    } catch (error) {
      if (run.current === active) setMessage(t('voice.failed', { detail: error instanceof Error ? error.message : String(error) }))
    } finally {
      dispose(active.recording)
      if (run.current === active) { run.current = undefined; setPhase('idle') }
    }
  }
  const start = async () => {
    if (locked || run.current) return
    const active = { abort: new AbortController(), span: currentTarget.current.capture(), phase: 'requesting' } as ActiveCapture
    run.current = active; setPhase('requesting'); setMessage(''); setPending(''); setNeedsSetup(false)
    try {
      const result = await service.remote.catalog()
      if (run.current !== active) return
      if (!result.ok) throw new Error(result.error.message)
      const catalog = result.value
      const provider = catalog.providers.find(item => item.id === catalog.selection.providerId)
      if (!provider || !['ready', 'standby', 'waking'].includes(provider.preparation.phase)) {
        setNeedsSetup(true); setMessage(t('voice.setup')); run.current = undefined; setPhase('idle'); return
      }
      if (!(catalog.maxDurationSeconds > 0 && Number.isFinite(catalog.maxDurationSeconds) && catalog.maxAudioBytes > 0)) throw new Error(t('voice.unavailable'))
      active.catalog = catalog
      active.recording = new Recording(() => {}) // System-default input; no private native preference access.
      await active.recording.start(error => {
        if (run.current !== active) return
        cancel(); setMessage(t('voice.failed', { detail: error.message }))
      })
      if (run.current !== active) return
      active.phase = 'recording'; setPhase('recording')
      active.timer = setTimeout(() => { void finish() }, catalog.maxDurationSeconds * 1000)
    } catch (error) {
      dispose(active.recording)
      if (run.current === active) { run.current = undefined; setPhase('idle'); setMessage(t('voice.failed', { detail: error instanceof Error ? error.message : String(error) })) }
    }
  }
  return <div className="btw-voice" onKeyDown={event => { if (event.key === 'Escape' && (run.current || pending)) { event.preventDefault(); event.stopPropagation(); cancel() } }}>
    <button type="button" disabled={locked || phase === 'requesting' || phase === 'transcribing' || Boolean(pending)}
      title={t('voice.defaultMicrophone')} aria-label={t(phase === 'recording' ? 'voice.stop' : 'voice.start')}
      onMouseDown={event => event.preventDefault()} onClick={() => { void (phase === 'recording' ? finish() : start()) }}>
      {phase === 'recording' ? <Square size={14} /> : <Mic size={16} />}{t(`voice.${phase}`)}
    </button>
    {(phase !== 'idle' || pending) && <button type="button" onMouseDown={event => event.preventDefault()} onClick={cancel}>{t('voice.cancel')}</button>}
    {pending && <><button type="button" disabled={locked} onMouseDown={event => event.preventDefault()} onClick={() => {
      if (currentTarget.current.insert(pending, currentTarget.current.capture())) { setPending(''); setMessage('') }
      else setMessage(t('voice.conflict'))
    }}>{t('voice.insert')}</button><p className="btw-voice-transcript">{pending}</p></>}
    {message && <p role="status">{message}</p>}
    {needsSetup && service.openSettings && <button type="button" onClick={service.openSettings}>{t('voice.settings')}</button>}
  </div>
}
