'use strict'

// chartjs-plugin-zoom registers itself for EVERY Chart.js chart of the page when it is imported. DWC draws its own charts (the temperature
// chart of the dashboard) before a plugin chunk loads, and those charts have no `$zoom`: the global plugin then throws in beforeUpdate
// ("Cannot set properties of undefined (setting '_options')") on every update, once a second. So the plugin is loaded with its global
// registration held back, and the chart that wants zoom takes it in its own `plugins` list.

import Chart from 'chart.js'

let plugin
// the list for the `plugins` option of a chart: the zoom plugin, or nothing when it did not register
export function zoomPlugins() {
	if (plugin !== undefined) return plugin ? [plugin] : []
	const register = Chart.plugins.register
	plugin = null
	Chart.plugins.register = p => { plugin = p }
	try {
		require('chartjs-plugin-zoom')
	} finally {
		Chart.plugins.register = register
	}
	return plugin ? [plugin] : []
}
