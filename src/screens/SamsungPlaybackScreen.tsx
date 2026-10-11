import { useEffect, useRef, useState } from 'preact/hooks'
import { getMediaLinks } from '../api/kinopub'
import { getAvailableQualities } from '../platform/media'
import { setScreensaver } from '../platform/tizen'
import { playerDiagnostic, probeManifest } from '../tizen/diagnostics'
import { saveLocalPlaybackProgress } from '../storage'
import { PlayerScreen, type PlayerProps } from './PlayerScreen'
import { SamsungPlayerScreen } from './SamsungPlayerScreen'

/** MP4 seek blocks AVPlay on the tested TV. Use the media element for MP4. */
export function SamsungPlaybackScreen(props: PlayerProps) {
  const quality = props.initialQuality || getAvailableQualities(props.files)[0]
  const nativeHls4 = props.files?.find(file => file.quality === quality)?.url.hls4
  const mp4 = props.files?.find(file => file.quality === quality)?.url.http
    || (/\.mp4(?:\?|$)/i.test(props.url) ? props.url : '')
  const [restart, setRestart] = useState<Partial<PlayerProps> & { count: number }>({ count: 0 })
  const [buffering, setBuffering] = useState(true)
  const attempts = useRef(0)
  const latest = useRef(props)
  latest.current = props
  const source = restart.url || mp4
  const position = restart.startTime ?? props.startTime ?? 0

  useEffect(() => {
    attempts.current = 0
    setRestart({ count: 0 })
  }, [props.url, props.mediaId])

  useEffect(() => {
    if (!source || nativeHls4) return
    const video = document.querySelector('.player-video') as HTMLVideoElement | null
    if (!video) return
    setBuffering(true)
    let active = true
    let timer = 0
    let firstTime = false
    let savedSecond = -1
    const abort = new AbortController()
    playerDiagnostic('html-load', { host: new URL(source).hostname, kind: 'mp4', resume: position })
    const hls = (restart.files || latest.current.files)?.find(file => file.quality === quality)?.url.hls
    if (hls) void probeManifest(hls)
    const metadata = () => playerDiagnostic('html-metadata', { duration: Number.isFinite(video.duration) ? video.duration : 0 })
    const playing = () => { setBuffering(false); setScreensaver(false); playerDiagnostic('html-playing', { resume: video.currentTime }) }
    const pause = () => setScreensaver(true)
    const waiting = () => { setBuffering(true); playerDiagnostic('html-wait', { resume: video.currentTime }) }
    const time = () => {
      const second = Math.floor(video.currentTime)
      const item = latest.current
      if (second !== savedSecond && second > 0) {
        savedSecond = second
        if (item.itemId) saveLocalPlaybackProgress(item.itemId, video.currentTime, item.episode || 1, item.season)
      }
      if (!firstTime && video.currentTime > 0) {
        firstTime = true
        playerDiagnostic('html-first-time', { resume: video.currentTime })
      }
    }
    const error = () => {
      setBuffering(false)
      playerDiagnostic('html-error', { code: video.error?.code || 0 })
      if (video.error?.code !== 2 || document.hidden || attempts.current >= 2 || timer) return
      attempts.current++
      const resume = video.currentTime > 0 ? video.currentTime : position
      const currentSource = video.currentSrc || source
      const currentFiles = restart.files || latest.current.files || []
      const selected = currentFiles.find(file => file.url.http === currentSource)?.quality || quality
      timer = window.setTimeout(async () => {
        let files = currentFiles
        if (latest.current.mediaId) {
          try {
            const links = await getMediaLinks(latest.current.mediaId, { refresh: true, signal: abort.signal })
            if (links.files.length) files = links.files
          } catch { /* retry the existing URL if API is temporarily unavailable */ }
        }
        if (!active) return
        const url = files.find(file => file.quality === selected)?.url.http || currentSource
        playerDiagnostic('html-reconnect', { resume, attempt: attempts.current })
        setRestart(previous => ({ count: previous.count + 1, url, startTime: resume, files, initialQuality: selected }))
      }, attempts.current * 1500)
    }
    const hidden = () => { if (document.hidden) video.pause() }
    const listeners = { loadedmetadata: metadata, playing, pause, waiting, timeupdate: time, error }
    for (const [name, handler] of Object.entries(listeners)) video.addEventListener(name, handler)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      active = false
      abort.abort()
      window.clearTimeout(timer)
      for (const [name, handler] of Object.entries(listeners)) video.removeEventListener(name, handler)
      document.removeEventListener('visibilitychange', hidden)
      setScreensaver(true)
    }
  }, [source, position, restart.count, restart.files, quality, nativeHls4])

  // AVC HLS4 avoids the progressive MP4 range/seek failure observed on this TV.
  if (nativeHls4) return <SamsungPlayerScreen {...props} url={nativeHls4} streamingType="hls4" />
  if (!source) return <SamsungPlayerScreen {...props} />
  return <>
    <PlayerScreen {...props} {...restart} key={`${props.url}:${restart.count}`}
      url={source} startTime={position} preferHttp />
    {buffering && <div class="samsung-buffer" role="status"><div class="spinner spinner-md" />Загрузка видео…</div>}
  </>
}
