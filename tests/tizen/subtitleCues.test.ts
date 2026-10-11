import { describe, expect, it } from 'vitest'
import { parseSubtitleCues, subtitleAt } from '../../src/tizen/subtitleCues'

describe('TV text subtitle renderer', () => {
  it('parses SRT with BOM, CRLF and markup as safe plain text', () => {
    const cues = parseSubtitleCues('\uFEFF1\r\n00:00:01,250 --> 00:00:03,000\r\n<i>Привет</i> &amp; мир\r\n\r\n2\r\n00:00:04,000 --> 00:00:05,000\r\nПока')
    expect(cues[0]).toEqual({ start: 1.25, end: 3, text: 'Привет & мир' })
    expect(subtitleAt(cues, 1.5)).toBe('Привет & мир')
    expect(subtitleAt(cues, 3)).toBe('')
    expect(subtitleAt(cues, 4)).toBe('Пока')
  })
  it('parses WebVTT with cue ids, settings and minute timestamps', () => {
    const cues = parseSubtitleCues('WEBVTT\n\nintro\n00:10.000 --> 00:13.000 align:center\nHello\nworld')
    expect(cues).toEqual([{ start: 10, end: 13, text: 'Hello\nworld' }])
  })
  it('rejects invalid intervals and handles seeking backwards', () => {
    const cues = parseSubtitleCues('1\n00:00:10,000 --> 00:00:11,000\nLater\n\n2\n00:00:01,000 --> 00:00:03,000\nEarlier\n\n3\n00:00:12,000 --> 00:00:11,000\nInvalid')
    expect(cues).toHaveLength(2)
    expect(subtitleAt(cues, 10)).toBe('Later')
    expect(subtitleAt(cues, 2)).toBe('Earlier')
  })
})
