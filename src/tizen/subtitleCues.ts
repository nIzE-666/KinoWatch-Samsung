export interface SubtitleCue { start: number; end: number; text: string }

function timestamp(value: string): number {
  const parts = value.replace(',', '.').split(':').map(Number)
  if (parts.some(part => !Number.isFinite(part))) return NaN
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2]
    : parts.length === 2 ? parts[0] * 60 + parts[1] : NaN
}

/** SRT and WebVTT only. Render plain text, never subtitle markup as HTML. */
export function parseSubtitleCues(text: string): SubtitleCue[] {
  const cues: SubtitleCue[] = []
  for (const block of text.replace(/^\uFEFF/, '').replace(/\r/g, '').split(/\n\s*\n/)) {
    const lines = block.split('\n')
    const timing = lines.findIndex(line => line.includes('-->'))
    if (timing < 0) continue
    const match = lines[timing].match(/^(\S+)\s+-->\s+(\S+)/)
    if (!match) continue
    const start = timestamp(match[1])
    const end = timestamp(match[2])
    const body = lines.slice(timing + 1).join('\n').replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    if (Number.isFinite(start) && end > start && body) cues.push({ start, end, text: body })
  }
  return cues.sort((a, b) => a.start - b.start)
}

export function subtitleAt(cues: SubtitleCue[], seconds: number): string {
  // Binary search to the latest started cue; scan only overlapping nearby cues.
  let low = 0
  let high = cues.length
  while (low < high) {
    const mid = (low + high) >>> 1
    if (cues[mid].start <= seconds) low = mid + 1
    else high = mid
  }
  const active: string[] = []
  for (let i = low - 1; i >= 0 && i >= low - 8; i--) {
    if (cues[i].end > seconds) active.unshift(cues[i].text)
  }
  return active.join('\n')
}

export async function loadSubtitleCues(url: string, signal: AbortSignal): Promise<SubtitleCue[]> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error('Субтитры недоступны')
  const buffer = await response.arrayBuffer()
  if (buffer.byteLength > 4 * 1024 * 1024) throw new Error('Слишком большой файл субтитров')
  let text = new TextDecoder('utf-8').decode(buffer)
  if (text.includes('�')) text = new TextDecoder('windows-1251').decode(buffer)
  const cues = parseSubtitleCues(text)
  if (!cues.length) throw new Error('Поддерживаются текстовые субтитры SRT и WebVTT')
  return cues
}
