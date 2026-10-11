import { describe, expect, it } from 'vitest'
import { streamCandidates } from '../../src/tizen/streamCandidates'

describe('Samsung format fallback', () => {
  it('tries only service URLs at the requested quality and keeps selected HLS audio', () => {
    const files = [
      { quality: '720p', url: { hls: 'https://example.test/master-v1a1.m3u8', hls2: 'https://example.test/modern.m3u8', http: 'https://example.test/720.mp4' } },
      { quality: '2160p', url: { http: 'https://example.test/4k.mp4' } }
    ]
    expect(streamCandidates(files[0].url.hls!, files, '720p', 2)).toEqual([
      'https://example.test/720.mp4', 'https://example.test/master-v1a3.m3u8', 'https://example.test/modern.m3u8'
    ])
  })
  it('deduplicates URLs and rejects unsupported protocols', () => {
    expect(streamCandidates('https://example.test/a.m3u8', [{ quality: '720p', url: { hls2: 'https://example.test/a.m3u8', http: 'file:///tmp/a.mp4' } }], '720p', 0)).toEqual(['https://example.test/a.m3u8'])
  })
  it('keeps explicitly selected HLS4 before MP4 to avoid the TV range-seek failure', () => {
    const urls = { hls4: 'https://example.test/avc.m3u8', hls2: 'https://example.test/avc2.m3u8', http: 'https://example.test/avc.mp4' }
    expect(streamCandidates(urls.hls4, [{ quality: '720p', url: urls }], '720p', 0)).toEqual([urls.hls4, urls.hls2, urls.http])
  })
})
