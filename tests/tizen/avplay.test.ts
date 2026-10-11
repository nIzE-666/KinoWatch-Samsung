import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SamsungAVPlayer, type AVPlayApi, type AVPlayListener, type AVPlayState } from '../../src/tizen/avplay'

describe('Samsung AVPlay', () => {
  let api: AVPlayApi
  let listener: AVPlayListener
  let prepare: () => void
  let state: AVPlayState
  const events = { onTime: vi.fn(), onBuffering: vi.fn(), onPlaying: vi.fn(), onEnded: vi.fn(), onError: vi.fn() }
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    state = 'NONE'
    api = {
      open: vi.fn(() => { state = 'IDLE' }),
      close: vi.fn(() => { state = 'NONE' }),
      getState: vi.fn(() => state),
      setDisplayRect: vi.fn(), setDisplayMethod: vi.fn(),
      setListener: vi.fn(value => { listener = value }),
      prepareAsync: vi.fn(success => { prepare = () => { state = 'READY'; success() } }),
      play: vi.fn(() => { state = 'PLAYING' }),
      pause: vi.fn(() => { state = 'PAUSED' }),
      stop: vi.fn(() => { state = 'IDLE' }),
      seekTo: vi.fn((_time, success) => success()),
      getDuration: vi.fn(() => 120000),
      getCurrentTime: vi.fn(() => 30000),
      getTotalTrackInfo: vi.fn(() => [{ type: 'AUDIO', index: 3, extra_info: '{}' }]),
      setSelectTrack: vi.fn(), setSilentSubtitle: vi.fn(),
      getStreamingProperty: vi.fn(() => 'FALSE')
    }
  })
  afterEach(() => vi.useRealTimers())

  it('starts playback then restores milliseconds after the first clock callback', async () => {
    const player = new SamsungAVPlayer(api, events)
    const result = player.load('https://example.test/movie.m3u8', 32)
    expect(api.play).not.toHaveBeenCalled()
    prepare()
    expect(api.seekTo).not.toHaveBeenCalled()
    listener.oncurrentplaytime(1000)
    expect(await result).toMatchObject({ duration: 120, live: false })
    expect(api.seekTo).toHaveBeenCalledWith(32000, expect.any(Function), expect.any(Function))
    expect(api.play).toHaveBeenCalledTimes(1)
    expect(api.setDisplayRect).toHaveBeenCalledWith(0, 0, 1920, 1080)
  })
  it('waits for resume seek completion before pause or another play call', async () => {
    let sought: () => void = () => {}
    vi.mocked(api.seekTo).mockImplementation((_time, success) => { sought = success })
    const player = new SamsungAVPlayer(api, events)
    const result = player.load('https://example.test/a.mp4', 10)
    prepare()
    listener.oncurrentplaytime(1000)
    player.play()
    player.pause()
    expect(api.play).toHaveBeenCalledTimes(1)
    expect(api.pause).not.toHaveBeenCalled()
    sought()
    await result
    expect(api.play).toHaveBeenCalledTimes(1)
  })
  it('keeps a paused stream paused when reloading quality', async () => {
    const player = new SamsungAVPlayer(api, events)
    const result = player.load('https://example.test/a.mp4', 20, true)
    prepare()
    listener.oncurrentplaytime(1000)
    await result
    expect(api.pause).toHaveBeenCalledOnce()
    expect(events.onPlaying).toHaveBeenLastCalledWith(false)
  })
  it('ignores a cancelled prepare callback', async () => {
    const player = new SamsungAVPlayer(api, events)
    const result = player.load('https://example.test/a.mp4').catch(error => error.message)
    const old = prepare
    player.close()
    old()
    expect(await result).toBe('Playback cancelled')
    expect(api.play).not.toHaveBeenCalled()
    expect(api.close).toHaveBeenCalledOnce()
  })
  it('cancels the previous load and keeps its listener from changing new playback', async () => {
    const player = new SamsungAVPlayer(api, events)
    const first = player.load('https://example.test/a.mp4').catch(error => error.message)
    const oldListener = listener
    const second = player.load('https://example.test/b.mp4')
    oldListener.oncurrentplaytime(99000)
    oldListener.onerror('UnknownError')
    prepare()
    await second
    expect(await first).toBe('Playback cancelled')
    expect(events.onTime).not.toHaveBeenCalled()
    expect(events.onError).not.toHaveBeenCalled()
  })
  it('reports firmware errors without leaking signed URLs', async () => {
    const player = new SamsungAVPlayer(api, events)
    const result = player.load('https://example.test/a.mp4?token=private').catch(error => error.message)
    listener.onerror('Cannot play https://example.test/a.mp4?token=private')
    expect(await result).toBe('AVPlay: UnknownError')
    expect(events.onError).toHaveBeenCalledWith('AVPlay: UnknownError')
    expect(api.close).toHaveBeenCalledOnce()
  })
  it('closes a hung preparation after 30 seconds', async () => {
    const player = new SamsungAVPlayer(api, events)
    const result = player.load('https://example.test/a.mp4').catch(error => error.message)
    await vi.advanceTimersByTimeAsync(30000)
    expect(await result).toBe('AVPlay: PrepareTimeout')
    expect(api.close).toHaveBeenCalledOnce()
  })
  it('allows late buffering progress to extend preparation', async () => {
    const player = new SamsungAVPlayer(api, events)
    const result = player.load('https://example.test/a.mp4', 0, false, 45000)
    await vi.advanceTimersByTimeAsync(22000)
    listener.onbufferingprogress(99)
    await vi.advanceTimersByTimeAsync(40000)
    prepare()
    expect(await result).toMatchObject({ duration: 120 })
    expect(events.onError).not.toHaveBeenCalled()
  })
  it('caps preparation even if buffering keeps reporting progress', async () => {
    const player = new SamsungAVPlayer(api, events)
    const result = player.load('https://example.test/a.mp4', 0, false, 45000).catch(error => error.message)
    for (let index = 0; index < 5; index++) {
      await vi.advanceTimersByTimeAsync(22000)
      listener.onbufferingprogress(99)
    }
    await vi.advanceTimersByTimeAsync(10000)
    expect(await result).toBe('AVPlay: PrepareTimeout')
    expect(api.close).toHaveBeenCalledOnce()
  })
  it('converts playback callbacks into seconds', async () => {
    const player = new SamsungAVPlayer(api, events)
    const result = player.load('https://example.test/a.mp4')
    prepare(); await result
    listener.oncurrentplaytime(12345)
    expect(events.onTime).toHaveBeenCalledWith(12.345)
  })
  it('clamps seeks and ignores concurrent seek requests', async () => {
    const player = new SamsungAVPlayer(api, events)
    const result = player.load('https://example.test/a.mp4')
    prepare(); await result
    let sought: () => void = () => {}
    vi.mocked(api.seekTo).mockImplementation((_time, success) => { sought = success })
    const seeking = player.seek(999)
    await player.seek(30)
    expect(api.seekTo).toHaveBeenCalledTimes(1)
    expect(api.seekTo).toHaveBeenCalledWith(119000, expect.any(Function), expect.any(Function))
    sought(); await seeking
  })
  it('does not restore or seek live streams as VOD', async () => {
    vi.mocked(api.getStreamingProperty).mockReturnValue('TRUE')
    vi.mocked(api.getDuration).mockReturnValue(0)
    const player = new SamsungAVPlayer(api, events)
    const result = player.load('https://example.test/live.m3u8', 400)
    prepare(); expect(await result).toMatchObject({ live: true })
    expect(api.seekTo).not.toHaveBeenCalled()
    await expect(player.seek(20)).rejects.toThrow('прямого эфира')
  })
  it('switches audio in PLAYING and restores a prior pause', async () => {
    const player = new SamsungAVPlayer(api, events)
    const result = player.load('https://example.test/a.mp4', 0, true)
    prepare(); await result
    vi.mocked(api.setSelectTrack).mockImplementation(() => { expect(state).toBe('PLAYING') })
    player.selectAudio(3)
    expect(api.setSelectTrack).toHaveBeenCalledWith('AUDIO', 3)
    expect(state).toBe('PAUSED')
  })
  it('uses actual AVPlay text track indices and can disable subtitles', async () => {
    const player = new SamsungAVPlayer(api, events)
    const result = player.load('https://example.test/a.mp4')
    prepare(); await result
    player.selectSubtitle(5)
    expect(api.setSelectTrack).toHaveBeenCalledWith('TEXT', 5)
    expect(api.setSilentSubtitle).toHaveBeenLastCalledWith(false)
    player.selectSubtitle(null)
    expect(api.setSilentSubtitle).toHaveBeenLastCalledWith(true)
  })
})
