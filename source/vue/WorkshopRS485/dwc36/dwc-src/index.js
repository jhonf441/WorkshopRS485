'use strict'

// WorkshopRS485 -- "RS485" page (2026-10-09): USB-RS485 adapters (buses) and
// Modbus RTU devices on them (T3D servo, generic Modbus). The backend is the
// plugin itself (dsf/main.py, API rs485.*).

import './i18n-register.js'
import { registerRoute } from '../../routes'
import './safe-saving.js' // corte de luz: guardar con respaldo y en un paso (vue/_shared)

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
});
