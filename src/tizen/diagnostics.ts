declare const __TV_DIAGNOSTICS_URL__: string

/** Temporary development probe. Release builds compile this to a no-op. */
export function playerDiagnostic(event: string, fields: Record<string, string | number | boolean> = {}): void {
  if (!__TV_DIAGNOSTICS_URL__) return
  // Only explicitly selected technical fields. Never send media URLs, tokens or titles.
  fetch(__TV_DIAGNOSTICS_URL__, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, ...fields })
  }).catch(() => {})
}

export async function probeManifest(url: string): Promise<void> {
  if (!__TV_DIAGNOSTICS_URL__ || !/\.m3u8/i.test(url)) return
  const abort = new AbortController()
  const timer = window.setTimeout(() => abort.abort(), 20000)
  try {
    const response = await fetch(url, { signal: abort.signal })
    if (!response.ok) { playerDiagnostic('manifest', { status: response.status }); return }
    const text = await response.text()
    playerDiagnostic('manifest', {
      status: response.status,
      version: text.match(/#EXT-X-VERSION:(\d+)/)?.[1] || 'unknown',
      codecs: text.match(/CODECS="([^"]+)"/)?.[1] || 'unspecified',
      master: text.includes('#EXT-X-STREAM-INF'),
      encrypted: text.includes('#EXT-X-KEY'),
      valid: text.startsWith('#EXTM3U')
    })
  } catch { playerDiagnostic('manifest', { code: 'FetchFailed' }) }
  finally { window.clearTimeout(timer) }
}
