import { render } from 'preact'
import { App } from './app'
import { I18nProvider } from './i18n'
import { initializeTizen } from './platform/tizen'

initializeTizen()
render(<I18nProvider><App /></I18nProvider>, document.getElementById('app')!)
