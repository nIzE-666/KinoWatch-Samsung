import type { VideoFile } from '../api/kinopub'
import { withHlsAudioIndex } from '../platform/media'

/** Use only URLs supplied by the service, at the selected quality. */
export function streamCandidates(primary: string, files: VideoFile[], quality: string, audioIndex: number): string[] {
  const file = files.find(file => file.quality === quality)
  const urls = file?.url
  // On the 2020 TV the supplied HEVC HLS can buffer to 99% without becoming
  // READY. The MP4 at the same quality has been verified to play on this TV.
  const candidates = (urls?.hls4 === primary
    ? [primary, urls?.hls2, urls?.hls, urls?.http]
    : [urls?.http, primary, urls?.hls2, urls?.hls4, urls?.hls])
    .filter((url): url is string => !!url && /^https?:\/\//i.test(url))
    .map(url => withHlsAudioIndex(url, audioIndex))
  return Array.from(new Set(candidates))
}
