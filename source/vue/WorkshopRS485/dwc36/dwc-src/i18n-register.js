// Official DWC plugin localization: plugins.WorkshopRS485.* (see src/i18n/index.ts of DuetWebControl).
// Import this file FIRST in index.js so the texts exist before any module that reads them at load time.
import { registerPluginLocalization } from '../../i18n'
import is from './i18n/es.json'
import en from './i18n/en.json'
import './language-reload.js' // the page loads again when the DWC language changes (vue/_shared)

registerPluginLocalization('WorkshopRS485', 'es', is)
registerPluginLocalization('WorkshopRS485', 'en', en)
