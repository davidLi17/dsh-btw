// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { encodeWave, Recording } from '../src/client/voice/audio'
afterEach(() => vi.unstubAllGlobals())
it('upstream encoder produces mono PCM16 WAV without microphone access', () => {
  const bytes = encodeWave(new Float32Array([-1, 0, 1]))
  const view = new DataView(bytes.buffer)
  expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('RIFF')
  expect(view.getUint32(24, true)).toBe(16000)
  expect(view.getInt16(44, true)).toBe(-32768)
  expect(view.getInt16(48, true)).toBe(32767)
})
it('late simulated microphone grants release tracks after cancellation; disposal is idempotent', async () => {
  let grant!: (stream: MediaStream) => void
  const permission = new Promise<MediaStream>(resolve => { grant = resolve })
  const stop = vi.fn(), onDispose = vi.fn()
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(() => permission) } })
  const recording = new Recording(onDispose)
  const preview = recording.preview()
  const disposed = recording.dispose()
  expect(recording.dispose()).toBe(disposed)
  await disposed
  grant({ getTracks: () => [{ stop }] } as unknown as MediaStream)
  await expect(preview).rejects.toMatchObject({ kind: 'cancelled' })
  expect(stop).toHaveBeenCalledTimes(1); expect(onDispose).toHaveBeenCalledTimes(1)
})
