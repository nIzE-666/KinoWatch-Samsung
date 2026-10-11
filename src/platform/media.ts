export const QUALITY_ORDER = ['2160p', '1080p', '720p', '480p'] as const

export function getAvailableQualities(
  files?: Array<{ quality: string }> | null
): string[] {
  if (!files || files.length === 0) return []
  return QUALITY_ORDER.filter(q => files.some(f => f.quality === q))
}

export function getStreamUrl(
  files: Array<{ quality: string; url: { http?: string; hls?: string; hls2?: string; hls4?: string } }>,
  preferredQuality?: string,
  streamingType?: string,
  options?: { preferClassicHls?: boolean; preferHttp?: boolean }
): string | null {
  if (!files || files.length === 0) return null

  const qualityOrder = [...QUALITY_ORDER]

  let selectedFile = files[0]

  if (preferredQuality) {
    const preferred = files.find(f => f.quality === preferredQuality)
    if (preferred) selectedFile = preferred
  } else {
    for (const quality of qualityOrder) {
      const found = files.find(f => f.quality === quality)
      if (found) {
        selectedFile = found
        break
      }
    }
  }

  const url = selectedFile.url
  const type = streamingType?.toLowerCase() as keyof typeof url

  if (options?.preferHttp && url.http) return url.http

  // Classic HLS embeds озвучка as master-v1a1/a2… — needed for builtin track switch
  if (options?.preferClassicHls && url.hls) {
    return url.hls
  }

  const fallbackOrder: (keyof typeof url)[] = ['hls4', 'hls2', 'hls', 'http']

  if (type && url[type]) return url[type]

  for (const key of fallbackOrder) {
    if (url[key]) return url[key]
  }

  return null
}

/** Kinopub classic HLS: switch озвучка via master-v1aN playlist segment */
export function withHlsAudioIndex(streamUrl: string, audioListIndex: number): string {
  if (!streamUrl || audioListIndex < 0) return streamUrl
  if (/master-v1a\d+/i.test(streamUrl)) {
    return streamUrl.replace(/master-v1a\d+/i, `master-v1a${audioListIndex + 1}`)
  }
  return streamUrl
}
