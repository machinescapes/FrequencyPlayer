import type Hls from 'hls.js'
import type { Entry, Check } from './tv-feeds.ts'

/** A check must observe advancing playback. Ambiguous network failures never mean dead. */
export async function probeChannel(entry: Entry, signal: AbortSignal, options: {
  createVideo?: () => HTMLVideoElement; loadHls?: () => Promise<typeof Hls>; fetcher?: typeof fetch; timeoutMs?: number
} = {}): Promise<Check | undefined> {
  if (signal.aborted) return
  const at = Date.now()
  const result = (status: Check['status'], reason: string): Check => ({ status, reason, at })
  if (entry.playback === 'external') return result('external', 'External link; open manually to check.')
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return result('inconclusive', 'Offline; retry when connected.')
  const request = new AbortController(), combined = AbortSignal.any([signal, request.signal])
  let video: HTMLVideoElement | undefined, hls: Hls | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const listeners = new AbortController()
  try {
    return await new Promise<Check | undefined>(resolve => {
      let settled = false, initialTime: number | undefined
      const finish = (value?: Check) => { if (settled) return; settled = true; resolve(value) }
      signal.addEventListener('abort', () => finish(), { once: true, signal: listeners.signal })
      timer = setTimeout(() => finish(result('inconclusive', 'No advancing playback within 15 seconds; network, VPN or browser may be blocking access.')), options.timeoutMs ?? 15000)
      void (async () => {
        try {
          // Fetch enables a distinction between known HTTP errors and opaque CORS failures.
          const response = await (options.fetcher ?? fetch)(entry.url, { signal: combined })
          if (settled || signal.aborted) return
          if (!response.ok) {
            finish([404, 410].includes(response.status) ? result('failed', `Stream returned HTTP ${response.status}.`) : result('inconclusive', `HTTP ${response.status}; may require a VPN or access permission.`)); return
          }
          const text = await response.text()
          if (settled || signal.aborted) return
          if (!text.trimStart().startsWith('#EXTM3U')) { finish(result('failed', 'Stream returned an invalid HLS playlist.')); return }
        } catch {
          // Native HLS may work without fetch CORS. Still attempt actual media playback.
          if (settled || signal.aborted) return
        }
        const current = (options.createVideo ?? (() => document.createElement('video')))()
        video = current; current.muted = true; current.playsInline = true; current.preload = 'auto'
        current.addEventListener('timeupdate', () => {
          initialTime ??= current.currentTime
          if (current.currentTime - initialTime >= 0.5 && current.readyState >= 2) finish(result('working', 'Muted playback advanced successfully.'))
        }, { signal: listeners.signal })
        current.addEventListener('error', () => finish(current.error?.code === 3 ? result('failed', 'The browser could not decode this stream.') : result('inconclusive', 'Playback could not be established; network or browser restrictions may apply.')), { signal: listeners.signal })
        const start = () => { void current.play().catch(() => finish(result('inconclusive', 'Browser blocked muted playback; retry or check manually.'))) }
        if (current.canPlayType('application/vnd.apple.mpegurl')) { current.src = entry.url; start(); return }
        try {
          const Player = await (options.loadHls ?? (() => import('hls.js').then(m => m.default)))()
          if (settled || signal.aborted) return
          if (!Player.isSupported()) { finish(result('inconclusive', 'This browser does not support HLS.')); return }
          hls = new Player()
          hls.on(Player.Events.MANIFEST_PARSED, start)
          hls.on(Player.Events.ERROR, (_event, data) => { if (data.fatal) finish(result('inconclusive', 'HLS could not play; network, VPN or codec restrictions may apply.')) })
          hls.loadSource(entry.url); hls.attachMedia(current)
        } catch { finish(result('inconclusive', 'Could not load the browser player.')) }
      })().catch(() => finish(result('inconclusive', 'Could not complete this check.')))
    })
  } finally {
    clearTimeout(timer); listeners.abort(); request.abort(); hls?.destroy()
    if (video) { video.pause(); video.removeAttribute('src'); video.load(); video.remove() }
  }
}
export async function verifyChannels(entries: Entry[], signal: AbortSignal, onResult: (entry: Entry, check: Check, completed: number) => void, probe = probeChannel) {
  let next = 0, completed = 0
  async function worker() {
    while (!signal.aborted && next < entries.length) {
      const entry = entries[next++]
      const result = await probe(entry, signal)
      if (!signal.aborted && result) onResult(entry, result, ++completed)
    }
  }
  await Promise.all([worker(), worker()])
  return completed
}
