import { useState, useEffect, useRef, useCallback, useMemo } from 'preact/hooks'
import type { PlayerProps } from './PlayerScreen'
import { getMediaLinks, type VideoFile } from '../api/kinopub'
import { SamsungAVPlayer, type AVPlayTrack } from '../tizen/avplay'
import { streamCandidates } from '../tizen/streamCandidates'
import { playerDiagnostic } from '../tizen/diagnostics'
import { loadSubtitleCues, subtitleAt, type SubtitleCue } from '../tizen/subtitleCues'
import { getAvailableQualities, getStreamUrl, withHlsAudioIndex } from '../platform/media'
import { getAudioTrackName, saveAudioPreference, saveLocalPlaybackProgress } from '../storage'
import { sortSubtitleTracks, subtitleLanguageLabel } from '../utils/subtitles'
import { KEY_CODES } from '../hooks'
import { useI18n } from '../i18n'
import '../styles/player.css'
import '../styles/samsung-player.css'

type Panel = 'quality' | 'audio' | 'subtitles' | 'episodes'
interface Choice { label: string; apply: () => void }

function formatTime(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor(value % 3600 / 60)
  const rest = String(value % 60).padStart(2, '0')
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`
}

function trackLabel(track: AVPlayTrack): string {
  try {
    const info = JSON.parse(track.extra_info)
    return `${info.track_lang || info.language || 'Track'} ${track.index + 1}`
  } catch { return `Track ${track.index + 1}` }
}

export function SamsungPlayerScreen(props: PlayerProps) {
  const { t } = useI18n()
  const latest = useRef(props)
  latest.current = props
  const session = useRef<SamsungAVPlayer | null>(null)
  const time = useRef(props.startTime || 0)
  const playing = useRef(false)
  const ended = useRef(false)
  const stream = useRef(props.url)
  const loadSequence = useRef(0)
  const loading = useRef(false)
  const resolvedFiles = useRef<VideoFile[]>(props.files || [])
  const refreshAbort = useRef<AbortController | null>(null)
  const recoveryTimer = useRef(0)
  const recoveryAttempts = useRef(0)
  const selectedQuality = useRef(props.initialQuality || '')
  const cues = useRef<SubtitleCue[]>([])
  const cueShift = useRef(0)
  const subtitleAbort = useRef<AbortController | null>(null)
  const nativeSubtitle = useRef<number | null>(null)
  const lastDisplayedSecond = useRef(-1)
  const [currentTime, setCurrentTime] = useState(props.startTime || 0)
  const [duration, setDuration] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [buffering, setBuffering] = useState(true)
  const [bufferPercent, setBufferPercent] = useState(0)
  const [live, setLive] = useState(false)
  const [tracks, setTracks] = useState<AVPlayTrack[]>([])
  const [subtitle, setSubtitle] = useState('')
  const [visible, setVisible] = useState(true)
  const [toolbar, setToolbar] = useState(false)
  const [buttonIndex, setButtonIndex] = useState(0)
  const [panel, setPanel] = useState<Panel | null>(null)
  const [choiceIndex, setChoiceIndex] = useState(0)
  const [quality, setQuality] = useState(props.initialQuality || '')
  const [audioIndex, setAudioIndex] = useState(props.initialAudioIndex || 0)
  const audioSelection = useRef(props.initialAudioIndex || 0)
  const [subtitleIndex, setSubtitleIndex] = useState(-1)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const reportError = useCallback((error: unknown) => {
    setNotice(error instanceof Error ? error.message : 'Не удалось применить настройку')
    setVisible(true)
  }, [])
  const flush = useCallback(() => latest.current.onTimeUpdate?.(time.current), [])
  const leave = useCallback(() => {
    loadSequence.current++
    window.clearTimeout(recoveryTimer.current)
    refreshAbort.current?.abort()
    flush()
    session.current?.close()
    latest.current.onBack()
  }, [flush])

  const reload = useCallback(async (url: string, position: number, paused = !playing.current, refresh = false) => {
    const player = session.current
    if (!player) return
    const sequence = ++loadSequence.current
    window.clearTimeout(recoveryTimer.current)
    refreshAbort.current?.abort()
    stream.current = url
    ended.current = false
    setError(null)
    setNotice(null)
    setBuffering(true)
    loading.current = true
    if (refresh && latest.current.mediaId) {
      const abort = new AbortController()
      refreshAbort.current = abort
      const timer = window.setTimeout(() => abort.abort(), 12000)
      try {
        const links = await getMediaLinks(latest.current.mediaId, { refresh: true, signal: abort.signal })
        if (sequence !== loadSequence.current) return
        if (links.files.length) {
          resolvedFiles.current = links.files
          url = getStreamUrl(links.files, selectedQuality.current, latest.current.streamingType) || url
        }
      } catch { /* A temporary API failure can still be retried with the existing link. */ }
      finally { window.clearTimeout(timer) }
    }
    if (sequence !== loadSequence.current) return
    const options = streamCandidates(url, resolvedFiles.current, selectedQuality.current, audioSelection.current)
    if (!options.length) {
      loading.current = false
      setBuffering(false)
      setError('Нет доступной ссылки для воспроизведения')
      return
    }
    for (let index = 0; index < options.length; index++) {
      if (sequence !== loadSequence.current) return
      try {
        stream.current = options[index]
        if (index) setNotice('Проверка другого формата потока…')
        const media = await player.load(options[index], position, paused, 45000)
        if (sequence !== loadSequence.current) return
        setDuration(media.duration)
        setTracks(media.tracks)
        setLive(media.live)
        loading.current = false
        setNotice(null)
        // A track unavailable in a different container must not discard a
        // working video or trigger another lengthy stream preparation.
        try {
          if (!/master-v1a\d+/i.test(options[index]) && audioSelection.current > 0) {
            const audio = media.tracks.filter(track => track.type === 'AUDIO')[audioSelection.current]
            if (audio) player.selectAudio(audio.index)
          }
          if (nativeSubtitle.current !== null) player.selectSubtitle(nativeSubtitle.current)
        } catch (error) { reportError(error) }
        return
      } catch (error) {
        if (sequence !== loadSequence.current) return
        if (index < options.length - 1) continue
        loading.current = false
        playing.current = false
        setIsPlaying(false)
        setBuffering(false)
        setError(error instanceof Error ? error.message : 'Ошибка AVPlay')
        setVisible(true)
      }
    }
  }, [reportError])

  const recoverConnection = useCallback((message: string) => {
    if (loading.current) return // Preparation failures are handled by format fallback.
    const paused = !playing.current
    playing.current = false
    setIsPlaying(false)
    flush()
    if (message === 'AVPlay: PLAYER_ERROR_CONNECTION_FAILED' && !document.hidden && recoveryAttempts.current < 2) {
      recoveryAttempts.current++
      loading.current = true
      setError(null)
      setNotice(`Соединение прервалось. Повтор ${recoveryAttempts.current} из 2…`)
      setVisible(true)
      playerDiagnostic('reconnect', { attempt: recoveryAttempts.current, resume: time.current })
      recoveryTimer.current = window.setTimeout(() => {
        void reload(stream.current, time.current, paused, true)
      }, recoveryAttempts.current * 1500)
    } else {
      setError(message)
      setVisible(true)
    }
  }, [flush, reload])

  useEffect(() => {
    const api = window.webapis?.avplay
    if (!api) {
      setError('Samsung AVPlay недоступен. Запустите установленное приложение на телевизоре.')
      setBuffering(false)
      return
    }
    document.body.classList.add('avplay-active')
    document.documentElement.classList.add('avplay-active')
    time.current = props.startTime || 0
    lastDisplayedSecond.current = -1
    audioSelection.current = props.initialAudioIndex || 0
    resolvedFiles.current = props.files || []
    recoveryAttempts.current = 0
    selectedQuality.current = props.initialQuality || ''
    cues.current = []
    nativeSubtitle.current = null
    setCurrentTime(time.current)
    setQuality(props.initialQuality || '')
    setAudioIndex(audioSelection.current)
    setSubtitleIndex(-1)
    setSubtitle('')
    setPanel(null)
    setTracks([])
    setToolbar(false)
    setVisible(true)
    const player = new SamsungAVPlayer(api, {
      onTime: seconds => {
        time.current = seconds
        const integer = Math.floor(seconds)
        if (lastDisplayedSecond.current !== integer) {
          lastDisplayedSecond.current = integer
          setCurrentTime(seconds)
          const item = latest.current
          if (item.itemId) saveLocalPlaybackProgress(item.itemId, seconds, item.episode || 1, item.season)
        }
        setSubtitle(subtitleAt(cues.current, seconds - cueShift.current))
      },
      onBuffering: (busy, percent) => { setBuffering(busy); setBufferPercent(percent) },
      onPlaying: value => { playing.current = value; setIsPlaying(value) },
      onEnded: () => {
        flush()
        ended.current = true
        setVisible(true)
        latest.current.onPlayNextEpisode?.()
      },
      onError: recoverConnection
    })
    session.current = player
    void reload(props.url, props.startTime || 0, false)
    const lifecycle = () => {
      if (document.hidden) { flush(); player.pause() }
      else { setVisible(true) } // return paused so TV Home never resumes sound unexpectedly
    }
    const periodic = window.setInterval(() => { if (playing.current) flush() }, 10000)
    document.addEventListener('visibilitychange', lifecycle)
    window.addEventListener('pagehide', flush)
    return () => {
      loadSequence.current++
      window.clearTimeout(recoveryTimer.current)
      refreshAbort.current?.abort()
      flush()
      subtitleAbort.current?.abort()
      player.close()
      session.current = null
      window.clearInterval(periodic)
      document.removeEventListener('visibilitychange', lifecycle)
      window.removeEventListener('pagehide', flush)
      document.body.classList.remove('avplay-active')
      document.documentElement.classList.remove('avplay-active')
    }
  }, [props.url, props.itemId, props.season, props.episode, props.startTime, props.initialQuality, props.initialAudioIndex, reload, flush, recoverConnection])

  useEffect(() => {
    if (!visible || panel || toolbar || !isPlaying || error || buffering) return
    const timer = window.setTimeout(() => setVisible(false), 4000)
    return () => window.clearTimeout(timer)
  }, [visible, panel, toolbar, isPlaying, error, buffering])

  const seek = (offset: number) => {
    setVisible(true)
    if (live) { setNotice('Перемотка прямого эфира недоступна'); return }
    session.current?.seek(time.current + offset).then(flush).catch(reportError)
  }
  const toggle = () => {
    setVisible(true)
    try {
      if (error || ended.current) {
        recoveryAttempts.current = 0
        void reload(stream.current, error ? time.current : 0, false, !!error)
      }
      else if (playing.current) { session.current?.pause(); flush() }
      else session.current?.play()
    } catch (error) { reportError(error) }
  }

  const qualities = useMemo(() => getAvailableQualities(props.files), [props.files])
  const externalSubs = useMemo(() => sortSubtitleTracks((props.subtitles || []).filter(sub => !!sub.url)), [props.subtitles])
  const nativeSubs = tracks.filter(track => track.type === 'TEXT')
  const nativeAudios = tracks.filter(track => track.type === 'AUDIO')
  const audios = props.audios || []

  const chooseQuality = (selected: string) => {
    let url = getStreamUrl(resolvedFiles.current, selected, props.streamingType, { preferClassicHls: props.streamingType !== 'hls4' })
    if (!url) { setNotice('Нет ссылки для выбранного качества'); return }
    url = withHlsAudioIndex(url, audioSelection.current)
    setQuality(selected)
    selectedQuality.current = selected
    flush()
    void reload(url, time.current)
  }
  const chooseAudio = (index: number) => {
    try {
      const changed = withHlsAudioIndex(stream.current, index)
      if (/master-v1a\d+/i.test(stream.current)) {
        audioSelection.current = index
        void reload(changed, time.current)
      } else {
        const track = nativeAudios[index]
        if (!track) throw new Error('Эта дорожка недоступна в текущем потоке')
        session.current?.selectAudio(track.index)
        audioSelection.current = index
      }
      setAudioIndex(index)
      if (props.itemId && audios[index]) saveAudioPreference(props.itemId, audios[index])
    } catch (error) { reportError(error) }
  }
  const chooseSubtitle = async (index: number) => {
    subtitleAbort.current?.abort()
    cues.current = []
    setSubtitle('')
    nativeSubtitle.current = null
    try {
      session.current?.selectSubtitle(null)
      if (index < 0) { setSubtitleIndex(-1); return }
      const external = externalSubs[index]
      if (external) {
        const abort = new AbortController()
        subtitleAbort.current = abort
        setNotice('Загрузка субтитров…')
        const timer = window.setTimeout(() => abort.abort(), 15000)
        try {
          const loaded = await loadSubtitleCues(external.url, abort.signal)
          if (abort.signal.aborted) return
          cues.current = loaded
          cueShift.current = external.shift || 0
          setSubtitleIndex(index)
          setNotice(null)
        } finally { window.clearTimeout(timer) }
      } else {
        const track = nativeSubs[index - externalSubs.length]
        if (!track) return
        session.current?.selectSubtitle(track.index)
        nativeSubtitle.current = track.index
        setSubtitleIndex(index)
      }
    } catch (error) {
      if (subtitleAbort.current?.signal.aborted) return
      setSubtitleIndex(-1)
      reportError(error)
    }
  }

  const choices: Record<Panel, Choice[]> = {
    quality: qualities.map(value => ({ label: value, apply: () => chooseQuality(value) })),
    audio: (audios.length ? audios.map(getAudioTrackName) : nativeAudios.map(trackLabel))
      .map((label, index) => ({ label, apply: () => chooseAudio(index) })),
    subtitles: [{ label: t.subtitlesOff, apply: () => void chooseSubtitle(-1) },
      ...externalSubs.map((sub, index) => ({ label: subtitleLanguageLabel(sub.lang, sub.forced), apply: () => void chooseSubtitle(index) })),
      ...nativeSubs.map((track, index) => ({ label: trackLabel(track), apply: () => void chooseSubtitle(externalSubs.length + index) }))],
    episodes: (props.seasonsSummary || []).reduce<Choice[]>((list, season) => {
      for (const episode of season.episodes) list.push({
        label: `${season.number === 0 ? '' : `S${season.number} `}E${episode.number} ${episode.title || ''}`,
        apply: () => { flush(); props.onPlayEpisode?.(season.number, episode.number) }
      })
      return list
    }, [])
  }
  const openPanel = (target: Panel) => {
    if (!choices[target].length) { setNotice('Нет доступных вариантов'); setVisible(true); return }
    setChoiceIndex(target === 'quality' ? Math.max(0, qualities.indexOf(quality))
      : target === 'audio' ? audioIndex : target === 'subtitles' ? subtitleIndex + 1 : 0)
    setPanel(target)
    setVisible(true)
  }
  const buttons: Choice[] = [
    { label: isPlaying ? 'Ⅱ Пауза' : '▶ Смотреть', apply: toggle },
    { label: `1 · ${quality || t.quality}`, apply: () => openPanel('quality') },
    { label: `2 · ${t.audio}`, apply: () => openPanel('audio') },
    { label: `3 · ${t.subtitles}`, apply: () => openPanel('subtitles') },
    ...(choices.episodes.length ? [{ label: `4 · ${t.episodes}`, apply: () => openPanel('episodes') }] : []),
    ...(props.onPlayPreviousEpisode ? [{ label: '◀ Предыдущая', apply: () => { flush(); props.onPlayPreviousEpisode?.() } }] : []),
    ...(props.onPlayNextEpisode ? [{ label: 'Следующая ▶', apply: () => { flush(); props.onPlayNextEpisode?.() } }] : [])
  ]

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const key = event.keyCode
      if (key === KEY_CODES.BACK || key === KEY_CODES.TIZEN_BACK || key === KEY_CODES.BACKSPACE) {
        if (panel) setPanel(null)
        else leave()
      } else if (key === KEY_CODES.RED || key === 49) openPanel('quality')
      else if (key === KEY_CODES.GREEN || key === 50) openPanel('audio')
      else if (key === KEY_CODES.YELLOW || key === 51) openPanel('subtitles')
      else if (key === KEY_CODES.BLUE || key === 52) openPanel('episodes')
      else if (key === KEY_CODES.PLAY_PAUSE || key === KEY_CODES.TIZEN_PLAY_PAUSE || key === 32) toggle()
      else if (key === KEY_CODES.PLAY) { try { session.current?.play() } catch (error) { reportError(error) } }
      else if (key === KEY_CODES.PAUSE) { try { session.current?.pause(); flush() } catch (error) { reportError(error) } }
      else if (key === KEY_CODES.STOP) leave()
      else if (key === KEY_CODES.REWIND) seek(-30)
      else if (key === KEY_CODES.FAST_FORWARD) seek(30)
      else if (panel) {
        if (key === KEY_CODES.UP) setChoiceIndex(Math.max(0, choiceIndex - 1))
        else if (key === KEY_CODES.DOWN) setChoiceIndex(Math.min(choices[panel].length - 1, choiceIndex + 1))
        else if (key === KEY_CODES.ENTER) { choices[panel][choiceIndex]?.apply(); setPanel(null) }
        else return
      } else if (key === KEY_CODES.UP) { setVisible(true); setToolbar(true); setButtonIndex(0) }
      else if (key === KEY_CODES.DOWN) { setToolbar(false); setVisible(false) }
      else if (key === KEY_CODES.LEFT || key === KEY_CODES.RIGHT) {
        const delta = key === KEY_CODES.LEFT ? -1 : 1
        if (toolbar) setButtonIndex(Math.max(0, Math.min(buttons.length - 1, buttonIndex + delta)))
        else seek(delta * 10)
      } else if (key === KEY_CODES.ENTER) {
        if (toolbar) buttons[buttonIndex]?.apply()
        else toggle()
      } else if (key === 457) { setVisible(true); setToolbar(true) }
      else return
      event.preventDefault()
      event.stopPropagation()
    }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  })

  useEffect(() => {
    document.querySelector('.samsung-player .player-panel-item.selected')?.scrollIntoView({ block: 'nearest' })
  }, [panel, choiceIndex])

  return <div class="player-screen samsung-player">
    <object class="samsung-video" type="application/avplayer" aria-label="Samsung AVPlay" />
    {buffering && <div class="samsung-buffer" role="status"><div class="spinner spinner-md" />{t.loading} {bufferPercent}%</div>}
    {subtitle && <div class="samsung-subtitle">{subtitle}</div>}
    {(visible || error || notice) && <div class="player-overlay">
      <div class="player-top"><h1 class="player-title">{props.title}</h1></div>
      {error && <div class="samsung-message" role="alert">{error}<br />Нажмите OK для повтора или «Назад» для выхода.</div>}
      {notice && !error && <div class="samsung-message" role="status">{notice}</div>}
      <div class="player-bottom">
        <div class="player-progress-bar"><div class="player-progress-current" style={{ width: `${duration > 0 ? Math.min(100, currentTime / duration * 100) : 0}%` }} /></div>
        <div class="player-time"><span>{formatTime(currentTime)}</span><span>{live ? 'LIVE' : formatTime(duration)}</span></div>
        <div class="samsung-controls">{buttons.map((button, index) => <button type="button" class={toolbar && index === buttonIndex ? 'focused' : ''} onClick={button.apply} key={button.label}>{button.label}</button>)}</div>
        <p class="samsung-help">← / → · 10 сек. &nbsp; ↑ · настройки &nbsp; OK · пауза &nbsp; Назад · выход</p>
      </div>
    </div>}
    {panel && <div class="player-panel"><h2 class="player-panel-title">{t[panel === 'quality' ? 'quality' : panel === 'audio' ? 'audio' : panel === 'subtitles' ? 'subtitles' : 'episodes']}</h2>
      <div class="player-panel-list">{choices[panel].map((choice, index) => <button type="button" key={`${index}-${choice.label}`} class={`player-panel-item ${index === choiceIndex ? 'selected' : ''}`} onClick={() => { choice.apply(); setPanel(null) }}>{choice.label}</button>)}</div>
    </div>}
  </div>
}
