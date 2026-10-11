import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { SamsungPlayerScreen } from '../../src/screens/SamsungPlayerScreen'
import { I18nProvider } from '../../src/i18n'
import { getMediaLinks } from '../../src/api/kinopub'
import type { AVPlayApi, AVPlayListener, AVPlayState } from '../../src/tizen/avplay'

vi.mock('../../src/api/kinopub', () => ({ getMediaLinks: vi.fn() }))

describe('Samsung player recovery and remote controls', () => {
  let state: AVPlayState
  let listener: AVPlayListener
  let api: AVPlayApi
  const files = [
    { quality: '1080p', url: { http: 'https://example.test/1080.mp4' } },
    { quality: '720p', url: { http: 'https://example.test/720.mp4', hls: 'https://example.test/master-v1a1.m3u8' } }
  ]
  const onBack = vi.fn()
  const onTimeUpdate = vi.fn()
  const key = (keyCode: number) => fireEvent.keyDown(document, { keyCode })
  const mount = () => render(<I18nProvider><SamsungPlayerScreen
    url={files[1].url.hls!} files={files} initialQuality="720p" title="Test video"
    mediaId={77} onBack={onBack} onTimeUpdate={onTimeUpdate}
  /></I18nProvider>)

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    state = 'NONE'
    api = {
      open: vi.fn(() => { state = 'IDLE' }), close: vi.fn(() => { state = 'NONE' }),
      getState: vi.fn(() => state), setDisplayRect: vi.fn(), setDisplayMethod: vi.fn(),
      setListener: vi.fn(value => { listener = value }),
      prepareAsync: vi.fn(success => { state = 'READY'; success() }),
      play: vi.fn(() => { state = 'PLAYING'; listener.oncurrentplaytime(1000) }), pause: vi.fn(() => { state = 'PAUSED' }),
      stop: vi.fn(() => { state = 'IDLE' }), seekTo: vi.fn((_time, success) => success()),
      getDuration: vi.fn(() => 120000), getCurrentTime: vi.fn(() => 0),
      getTotalTrackInfo: vi.fn(() => []), getStreamingProperty: vi.fn(() => 'FALSE'),
      setSelectTrack: vi.fn(), setSilentSubtitle: vi.fn()
    }
    vi.stubGlobal('webapis', { avplay: api })
    vi.mocked(getMediaLinks).mockResolvedValue({
      files: [{ quality: '720p', url: { http: 'https://example.test/fresh.mp4' } }], subtitles: []
    })
    Element.prototype.scrollIntoView = vi.fn()
  })
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

  it('starts the verified MP4 directly and falls back if that preparation fails', async () => {
    let attempt = 0
    vi.mocked(api.prepareAsync).mockImplementation((success, failure) => {
      if (++attempt === 1) failure('PLAYER_ERROR_CONNECTION_FAILED')
      else { state = 'READY'; success() }
    })
    mount()
    await waitFor(() => expect(api.play).toHaveBeenCalledOnce())
    expect(vi.mocked(api.open).mock.calls.map(call => call[0])).toEqual([
      'https://example.test/720.mp4', 'https://example.test/master-v1a1.m3u8'
    ])
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('refreshes the service link and resumes at the last position after a dropped connection', async () => {
    mount()
    await waitFor(() => expect(api.play).toHaveBeenCalledOnce())
    act(() => { listener.oncurrentplaytime(31250); listener.onerror('PLAYER_ERROR_CONNECTION_FAILED') })
    await act(async () => { await vi.advanceTimersByTimeAsync(1600) })
    await waitFor(() => expect(api.open).toHaveBeenLastCalledWith('https://example.test/fresh.mp4'))
    expect(getMediaLinks).toHaveBeenCalledWith(77, { refresh: true, signal: expect.any(AbortSignal) })
    expect(api.seekTo).toHaveBeenLastCalledWith(31250, expect.any(Function), expect.any(Function))
    expect(onTimeUpdate).toHaveBeenCalledWith(31.25)
    expect(state).toBe('PLAYING')
  })

  it('bounds automatic recovery to two attempts and leaves a manual retry', async () => {
    mount()
    await waitFor(() => expect(api.play).toHaveBeenCalledOnce())
    for (let attempt = 1; attempt <= 2; attempt++) {
      act(() => listener.onerror('PLAYER_ERROR_CONNECTION_FAILED'))
      await act(async () => { await vi.advanceTimersByTimeAsync(3100) })
      await waitFor(() => expect(api.play).toHaveBeenCalledTimes(attempt + 1))
    }
    act(() => listener.onerror('PLAYER_ERROR_CONNECTION_FAILED'))
    await act(async () => { await vi.advanceTimersByTimeAsync(6000) })
    expect(getMediaLinks).toHaveBeenCalledTimes(2)
    expect(api.open).toHaveBeenCalledTimes(3)
    expect(screen.getByRole('alert').textContent).toContain('PLAYER_ERROR_CONNECTION_FAILED')
  })

  it('cancels a scheduled reconnect when Back is pressed', async () => {
    mount()
    await waitFor(() => expect(api.play).toHaveBeenCalledOnce())
    act(() => listener.onerror('PLAYER_ERROR_CONNECTION_FAILED'))
    key(10009)
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    expect(onBack).toHaveBeenCalledOnce()
    expect(api.open).toHaveBeenCalledOnce()
    expect(getMediaLinks).not.toHaveBeenCalled()
  })

  it('applies highlighted quality only on OK and preserves time and pause', async () => {
    mount()
    await waitFor(() => expect(api.play).toHaveBeenCalledOnce())
    act(() => listener.oncurrentplaytime(42000))
    key(10252) // Samsung Play/Pause
    key(49) // Quality
    key(38) // Highlight 1080p
    expect(api.open).toHaveBeenCalledOnce()
    key(13)
    await waitFor(() => expect(api.open).toHaveBeenLastCalledWith('https://example.test/1080.mp4'))
    expect(api.seekTo).toHaveBeenLastCalledWith(42000, expect.any(Function), expect.any(Function))
    expect(state).toBe('PAUSED')
  })
})
