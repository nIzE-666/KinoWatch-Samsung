import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { registerDevice } from '../../src/api/kinopub'
import { invalidateCache } from '../../src/api/cache'

const mockFetch = vi.fn()
global.fetch = mockFetch

describe('registerDevice', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    localStorage.clear()
    invalidateCache()
    localStorage.setItem('kpuppy_tokens', JSON.stringify({
      access: 'valid-token',
      refresh: 'refresh-token',
      expiresAt: Date.now() + 3600000
    }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('notifies Kinopub as Kinopub TV without KPuppy branding', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.106 Safari/537.36 WebAppManager'
    )
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({})
    })

    await registerDevice()

    const call = mockFetch.mock.calls[0]
    expect(call[0]).toBe('https://api.service-kp.com/v1/device/notify')
    expect(call[1].method).toBe('POST')

    const body = JSON.parse(call[1].body)
    expect(body).toEqual({
      title: 'Kinopub TV',
      hardware: 'Chrome 68.0.3440.106',
      software: 'Web OS TV (Kinopub TV)'
    })
    expect(JSON.stringify(body)).not.toMatch(/KPuppy/i)
  })

  it('falls back to Chrome when userAgent has no Chrome build', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (compatible; SomeTV)')
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({})
    })

    await registerDevice()

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.hardware).toBe('Chrome')
    expect(body.title).toBe('Kinopub TV')
    expect(body.software).toBe('Web OS TV (Kinopub TV)')
  })
})
