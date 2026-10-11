import { setScreensaver } from '../platform/tizen'
import { playerDiagnostic, probeManifest } from './diagnostics'

export type AVPlayState = 'NONE' | 'IDLE' | 'READY' | 'PLAYING' | 'PAUSED'
export interface AVPlayTrack { type: 'VIDEO' | 'AUDIO' | 'TEXT'; index: number; extra_info: string }
export interface AVPlayListener {
  onbufferingstart: () => void
  onbufferingprogress: (percent: number) => void
  onbufferingcomplete: () => void
  oncurrentplaytime: (milliseconds: number) => void
  onstreamcompleted: () => void
  onerror: (error: string) => void
  onevent?: (event: string, data: string) => void
}
export interface AVPlayApi {
  open: (url: string) => void
  close: () => void
  getState: () => AVPlayState
  setDisplayRect: (x: number, y: number, width: number, height: number) => void
  setDisplayMethod: (mode: string) => void
  setListener: (listener: AVPlayListener) => void
  prepareAsync: (success: () => void, failure: (error: unknown) => void) => void
  play: () => void
  pause: () => void
  stop: () => void
  seekTo: (milliseconds: number, success: () => void, failure: (error: unknown) => void) => void
  getDuration: () => number
  getCurrentTime: () => number
  getTotalTrackInfo: () => AVPlayTrack[]
  setSelectTrack: (type: 'AUDIO' | 'TEXT', index: number) => void
  setSilentSubtitle: (silent: boolean) => void
  getStreamingProperty: (property: string) => string
}
export interface PlayerEvents {
  onTime: (seconds: number) => void
  onBuffering: (buffering: boolean, percent: number) => void
  onPlaying: (playing: boolean) => void
  onEnded: () => void
  onError: (message: string) => void
}
export interface PreparedMedia { duration: number; tracks: AVPlayTrack[]; live: boolean }

/** Do not propagate signed media URLs or firmware error payloads into the UI. */
function playerError(error: unknown): Error {
  const code = typeof error === 'string' && /^[\w_]{1,80}$/.test(error)
    ? error : error instanceof Error ? error.name : 'UnknownError'
  return new Error(`AVPlay: ${code}`)
}

/** All AVPlay positions are milliseconds; the app uses seconds. */
export class SamsungAVPlayer {
  private generation = 0
  private pendingCancel: (() => void) | null = null
  private seeking = false
  private loaded = false

  constructor(private api: AVPlayApi, private events: PlayerEvents) {}

  load(url: string, startSeconds = 0, paused = false, timeoutMs = 30000): Promise<PreparedMedia> {
    playerDiagnostic('load', { host: new URL(url).hostname, kind: /\.m3u8/i.test(url) ? 'hls' : /\.mp4/i.test(url) ? 'mp4' : 'other', resume: startSeconds, paused })
    this.close()
    void probeManifest(url)
    const generation = this.generation
    const current = () => generation === this.generation
    return new Promise((resolve, reject) => {
      let settled = false
      let receivedTime = false
      let seekOnFirstTime: (() => void) | null = null
      let timer = 0
      const began = Date.now()
      const armTimeout = () => {
        window.clearTimeout(timer)
        // A hard cap still prevents an endless preparation loop.
        const remaining = Math.max(1, Math.min(timeoutMs, 120000 - (Date.now() - began)))
        timer = window.setTimeout(() => fail('PrepareTimeout'), remaining)
      }
      const finish = (error?: Error, media?: PreparedMedia) => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        this.pendingCancel = null
        if (error) reject(error)
        else resolve(media!)
      }
      this.pendingCancel = () => finish(new Error('Playback cancelled'))
      const fail = (error: unknown) => {
        if (!current()) return
        const safe = playerError(error)
        playerDiagnostic('error', { code: safe.message, state: this.api.getState() })
        if (!settled) finish(safe)
        this.close()
        this.events.onBuffering(false, 0)
        this.events.onError(safe.message)
      }
      armTimeout()
      try {
        if (!/^https?:\/\//i.test(url)) throw new Error('InvalidURL')
        this.api.open(url)
        playerDiagnostic('opened', { state: this.api.getState() })
        this.loaded = true
        this.api.setDisplayRect(0, 0, 1920, 1080)
        this.api.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX')
        this.api.setListener({
          onbufferingstart: () => { if (current()) { playerDiagnostic('buffer-start'); this.events.onBuffering(true, 0) } },
          onbufferingprogress: percent => { if (current()) {
            if (!settled && percent > 0) armTimeout()
            if (percent % 25 === 0 || percent === 99) playerDiagnostic('buffer', { percent })
            this.events.onBuffering(true, percent)
          } },
          onbufferingcomplete: () => { if (current()) { playerDiagnostic('buffer-done'); this.events.onBuffering(false, 100) } },
          oncurrentplaytime: time => { if (current()) {
            if (!receivedTime && time > 0) {
              receivedTime = true
              playerDiagnostic('first-time', { resume: time / 1000 })
            }
            if (seekOnFirstTime && time > 0) {
              const seek = seekOnFirstTime
              seekOnFirstTime = null
              seek()
              return
            }
            // Do not replace the saved resume position with startup frames.
            if (!settled && (seekOnFirstTime || this.seeking)) return
            this.events.onTime(time / 1000)
          } },
          onstreamcompleted: () => {
            if (!current()) return
            this.events.onPlaying(false)
            setScreensaver(true)
            this.events.onEnded()
          },
          onerror: fail,
          onevent: (event, data) => {
            if (current() && event === 'PLAYER_MSG_HTTP_ERROR_CODE') {
              const status = String(data).match(/\b[45]\d{2}\b/)
              if (status) playerDiagnostic('http-error', { status: Number(status[0]) })
            }
          }
        })
        this.events.onBuffering(true, 0)
        playerDiagnostic('preparing')
        this.api.prepareAsync(() => {
          if (!current()) return
          try {
            const duration = Math.max(0, this.api.getDuration() / 1000)
            playerDiagnostic('prepared', { duration })
            let live = duration === 0
            try { live = this.api.getStreamingProperty('IS_LIVE') === 'TRUE' || live } catch { /* optional */ }
            const tracks = this.api.getTotalTrackInfo()
            const complete = () => {
              if (!current()) return
              try {
                if (paused) this.api.pause()
                this.events.onPlaying(!paused)
                setScreensaver(paused)
                this.events.onBuffering(false, 100)
                finish(undefined, { duration, tracks, live })
              } catch (error) { fail(error) }
            }
            if (startSeconds > 0 && !live) {
              const target = Math.min(startSeconds, Math.max(0, duration - 1))
              // READY seek stalled on the physical 2020 TV. Wait for an
              // actual playback clock before seeking in PLAYING instead.
              seekOnFirstTime = () => {
                this.seeking = true
                playerDiagnostic('resume-seek', { resume: target })
                try {
                  this.api.seekTo(Math.round(target * 1000), () => {
                    if (!current()) return
                    this.seeking = false
                    this.events.onTime(target)
                    playerDiagnostic('resume-done', { resume: target })
                    complete()
                  }, error => { if (current()) { this.seeking = false; fail(error) } })
                } catch (error) { this.seeking = false; fail(error) }
              }
            }
            this.api.setSilentSubtitle(true)
            this.api.play()
            playerDiagnostic('playing', { state: this.api.getState() })
            if (!seekOnFirstTime && !this.seeking) complete()
          } catch (error) { fail(error) }
        }, fail)
      } catch (error) { fail(error) }
    })
  }

  play(): void {
    if (!this.loaded || this.seeking) return
    const state = this.api.getState()
    if (state !== 'READY' && state !== 'PAUSED' && state !== 'PLAYING') return
    this.api.play()
    setScreensaver(false)
    this.events.onPlaying(true)
  }

  pause(): void {
    if (!this.loaded || this.seeking || this.api.getState() !== 'PLAYING') return
    this.api.pause()
    setScreensaver(true)
    this.events.onPlaying(false)
  }

  seek(seconds: number): Promise<void> {
    if (!this.loaded || this.seeking || !['PLAYING', 'PAUSED'].includes(this.api.getState())) return Promise.resolve()
    const duration = this.api.getDuration() / 1000
    if (duration <= 0) return Promise.reject(new Error('Перемотка прямого эфира недоступна'))
    const generation = this.generation
    const target = Math.max(0, Math.min(seconds, Math.max(0, duration - 1)))
    this.seeking = true
    return new Promise((resolve, reject) => {
      const finish = (error?: unknown) => {
        if (generation === this.generation) this.seeking = false
        if (error) reject(playerError(error))
        else {
          if (generation === this.generation) this.events.onTime(target)
          resolve()
        }
      }
      try { this.api.seekTo(Math.round(target * 1000), () => finish(), finish) }
      catch (error) { finish(error) }
    })
  }

  selectAudio(index: number): void {
    if (!this.loaded || this.seeking) throw new Error('Дождитесь загрузки видео')
    const paused = this.api.getState() === 'PAUSED'
    if (paused) this.api.play() // Samsung permits AUDIO selection only while PLAYING.
    try { this.api.setSelectTrack('AUDIO', index) }
    finally { if (paused) this.api.pause() }
  }

  selectSubtitle(index: number | null): void {
    if (!this.loaded || this.seeking) throw new Error('Дождитесь загрузки видео')
    this.api.setSilentSubtitle(true)
    if (index !== null) {
      this.api.setSelectTrack('TEXT', index)
      this.api.setSilentSubtitle(false)
    }
  }

  close(): void {
    this.generation++
    this.pendingCancel?.()
    this.pendingCancel = null
    this.seeking = false
    if (this.loaded) {
      try { this.api.stop() } catch { /* failed/ended stream */ }
      try { this.api.close() } catch { /* firmware cleanup */ }
    }
    this.loaded = false
    setScreensaver(true)
  }
}
