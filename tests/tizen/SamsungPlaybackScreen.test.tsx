import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/preact'
import { SamsungPlaybackScreen } from '../../src/screens/SamsungPlaybackScreen'
import { I18nProvider } from '../../src/i18n'
import { getMediaLinks } from '../../src/api/kinopub'

vi.mock('../../src/api/kinopub', () => ({ getMediaLinks: vi.fn() }))
vi.mock('../../src/screens/SamsungPlayerScreen', () => ({
  SamsungPlayerScreen: ({ url }: { url: string }) => <object data-native-stream={url} />
}))

describe('Samsung MP4 compatibility player', () => {
  const files = [{ quality: '720p', url: { http: 'https://example.test/720.mp4', hls: 'https://example.test/720.m3u8' } }]
  const onBack = vi.fn()
  const open = vi.fn()
  const mount = () => render(<I18nProvider><SamsungPlaybackScreen url={files[0].url.hls}
    files={files} initialQuality="720p" startTime={78} mediaId={77} title="Test"
    onBack={onBack} /></I18nProvider>)
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.stubGlobal('webapis', { avplay: { open } })
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    vi.mocked(getMediaLinks).mockResolvedValue({ files: [{ quality: '720p', url: { http: 'https://example.test/fresh.mp4' } }], subtitles: [] })
  })
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('uses the media element without entering AVPlay and restores position on metadata', () => {
    mount()
    const video = document.querySelector('video')!
    expect(video.src).toBe('https://example.test/720.mp4')
    fireEvent.loadedMetadata(video)
    expect(video.currentTime).toBe(78)
    expect(open).not.toHaveBeenCalled()
  })
  it('routes AVC HLS4 to AVPlay before the problematic progressive MP4', () => {
    render(<I18nProvider><SamsungPlaybackScreen url={files[0].url.hls}
      files={[{ quality: '720p', url: { ...files[0].url, hls4: 'https://example.test/avc4.m3u8' } }]}
      initialQuality="720p" title="Test" onBack={onBack} /></I18nProvider>)
    expect(document.querySelector('video')).toBeNull()
    expect(document.querySelector('[data-native-stream]')?.getAttribute('data-native-stream')).toBe('https://example.test/avc4.m3u8')
  })
  it('refreshes a dropped MP4 and preserves playback time', async () => {
    mount()
    const video = document.querySelector('video')!
    video.currentTime = 92
    Object.defineProperty(video, 'error', { value: { code: 2 }, configurable: true })
    fireEvent.error(video)
    await act(async () => { await vi.advanceTimersByTimeAsync(1600) })
    await waitFor(() => expect(document.querySelector('video')!.src).toBe('https://example.test/fresh.mp4'))
    const replacement = document.querySelector('video')!
    fireEvent.loadedMetadata(replacement)
    expect(replacement.currentTime).toBe(92)
    expect(open).not.toHaveBeenCalled()
  })
  it('cancels recovery when the player is unmounted', async () => {
    const view = mount()
    const video = document.querySelector('video')!
    Object.defineProperty(video, 'error', { value: { code: 2 }, configurable: true })
    fireEvent.error(video)
    view.unmount()
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(getMediaLinks).not.toHaveBeenCalled()
  })
  it('uses Samsung Back without exposing URLs in error UI', () => {
    mount()
    const video = document.querySelector('video')!
    Object.defineProperty(video, 'error', { value: { code: 3, message: 'https://example.test/private?token=secret' }, configurable: true })
    fireEvent.error(video)
    expect(document.querySelector('.player-error')!.textContent).toContain('MEDIA_ERR_DECODE')
    expect(document.querySelector('.player-error')!.textContent).not.toContain('secret')
    fireEvent.keyDown(document, { keyCode: 10009 })
    expect(onBack).toHaveBeenCalledOnce()
  })
  it('keeps MP4 quality navigation pending until OK', () => {
    render(<I18nProvider><SamsungPlaybackScreen url={files[0].url.hls}
      files={[{ quality: '1080p', url: { http: 'https://example.test/1080.mp4' } }, ...files]}
      initialQuality="720p" title="Test" onBack={onBack} /></I18nProvider>)
    const video = document.querySelector('video')!
    Object.defineProperty(video, 'duration', { value: 300 })
    fireEvent.keyDown(document, { keyCode: 49 })
    fireEvent.keyDown(document, { keyCode: 38 })
    expect(video.src).toBe('https://example.test/720.mp4')
    fireEvent.keyDown(document, { keyCode: 13 })
    expect(video.src).toBe('https://example.test/1080.mp4')
    expect(open).not.toHaveBeenCalled()
  })
})
