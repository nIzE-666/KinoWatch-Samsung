import type { AVPlayApi } from '../tizen/avplay'

declare global {
  interface Window {
    tizen?: {
      application: { getCurrentApplication: () => { exit: () => void } }
      tvinputdevice?: {
        getSupportedKeys: () => Array<{ name: string; code: number }>
        registerKey: (name: string) => void
      }
    }
    webapis?: {
      avplay?: AVPlayApi
      appcommon?: { setScreenSaver: (state: 'SCREEN_SAVER_ON' | 'SCREEN_SAVER_OFF') => void }
      productinfo?: { getModel: () => string; getFirmware: () => string }
    }
  }
}

export function isTizen(): boolean {
  return typeof window !== 'undefined' && !!window.tizen
}

export function initializeTizen(): void {
  if (!isTizen()) return
  const input = window.tizen?.tvinputdevice
  if (!input) return
  const wanted = new Set([
    'MediaPlay', 'MediaPause', 'MediaPlayPause', 'MediaStop',
    'MediaRewind', 'MediaFastForward', 'MediaTrackPrevious', 'MediaTrackNext',
    'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue',
    'Info', '1', '2', '3', '4'
  ])
  try {
    input.getSupportedKeys().forEach(key => {
      if (!wanted.has(key.name)) return
      try { input.registerKey(key.name) } catch { /* optional key */ }
    })
  } catch { /* arrows, Enter and Back need no registration */ }
}

export function setScreensaver(enabled: boolean): void {
  try {
    window.webapis?.appcommon?.setScreenSaver(enabled ? 'SCREEN_SAVER_ON' : 'SCREEN_SAVER_OFF')
  } catch { /* optional firmware API */ }
}
