'use strict'

// WorkshopRS485 -- "RS485" page (2026-10-09): USB-RS485 adapters (buses) and
// Modbus RTU devices on them (T3D servo, generic Modbus). The backend is the
// plugin itself (dsf/main.py, API rs485.*).

import './i18n-register.js'
import { registerRoute } from 'DuetWebControl'
import { onPluginUnload, removePluginRoute } from './dwc-host.js'
import './language-reload.js' // the page loads again when the DWC language changes (vue/_shared)
import './safe-saving.js' // power cut: save with a backup and in one step (vue/_shared)

import RS485 from './RS485.vue'
import './theme.css'

registerRoute(RS485, {
	Plugins: {
		WorkshopRS485: {
			icon: 'mdi-serial-port',
			caption: 'plugins.WorkshopRS485.index.rs485',
			path: '/Plugins/RS485'
		}
	}
})

// DWC 3.7 does not undo anything when the plugin is stopped: take the page out and stop what runs by itself, so that a
// later start registers the new component and a single recorder (review #4)
onPluginUnload('WorkshopRS485', () => {
	removePluginRoute('/Plugins/RS485')
})
