import { platformBack as webosBack } from '../webos/service'
import { isTizen } from './tizen'

export function platformBack(): void {
  if (isTizen()) {
    try { window.tizen?.application.getCurrentApplication().exit() } catch { /* preview */ }
  } else {
    webosBack()
  }
}
