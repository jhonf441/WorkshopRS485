'use strict'

// The device profile (Device.vue: export; DeviceEditor.vue: import and example) as a file of the exchange standard (docs-internal/DATA-EXCHANGE.md):
// its format, what loading it changes in the device editor and the preview a person sees before it is loaded. Plain functions of their arguments,
// the same file in both DWC lines, run by test/device-exchange.test.js. The texts come in as `t(key, params)` (keys relative to
// plugins.WorkshopRS485.deviceEditor).
//
// The file is the envelope `workshop-rs485-device` (version 1) and its `data` is the profile the service writes and reads (dsf/profiles/profile_json.py):
//   { device: { brand, model, baud, parity, stop_bits, address, notes }, alarm_register: { register, function, no_alarm },
//     parameters: [{ register, function, name, unit, scale, access, signed, watch, min, max, default, description, options: [{ value, text }] }],
//     alarms: [{ code, text, cause, what_to_do, action }] }
// Every part is optional; the service validates it (rs485.profile_check, read only: nothing is saved) and skips a bad row with a notice.
// Loading a profile puts it in the editor of the device; nothing is saved until the person taps Save.

export const DEVICE_FORMAT = 'workshop-rs485-device'
export const DEVICE_VERSION = 1
export const DEVICE_PLUGIN = 'WorkshopRS485'
export const DEVICE_SPEC = { format: DEVICE_FORMAT, versions: [DEVICE_VERSION], plugins: [DEVICE_PLUGIN] }
// the rows a preview lists before it says "and n more"
const LISTED = 12

// The profile as the service answers it carries a `format` and a `version` of its own: the envelope says both, so the data does not
export function deviceData(profile) {
	const out = {}
	Object.keys(profile && typeof profile === 'object' ? profile : {}).forEach(k => {
		if (k !== 'format' && k !== 'version') {
			out[k] = profile[k]
		}
	})
	return out
}

function key(r) {
	return (r.func || 3) + '-' + r.record
}

// What loading `check` (the answer of profile_check: { profile, notices, options: { records } }) does to the options of the device
// (`options.records`: the registers read on every cycle): the registers the profile watches replace the ones with the same function and
// register; the ones added by hand that the profile does not bring stay (an empty row of the form does not).
// -> { watched, replaced, kept, records }
export function profilePlan(check, options) {
	const watched = (check && check.options && check.options.records) || []
	const incoming = new Set(watched.map(key))
	const current = (options && options.records) || []
	const kept = current.filter(r => r.record !== null && r.record !== '' && !incoming.has(key(r)))
	const replaced = current.filter(r => incoming.has(key(r)))
	return { watched, replaced, kept, records: watched.concat(kept) }
}

const par = d => `${d.baud} 8${d.parity || 'N'}${d.bits_stop || 1}`

// The profile says the device comes at a speed and format the bus does not have: { wants, has }, or null when they agree or either is unknown
export function busMismatch(device, bus) {
	if (!bus || !device || !device.baud) {
		return null
	}
	const wants = par(device)
	const has = par(bus)
	return wants === has ? null : { wants, has }
}

function nameOf(device) {
	return [device && device.mark, device && device.model].filter(Boolean).join(' ')
}

// The preview of a file that was read and checked by the service: what it holds and what would change in the editor. It changes nothing.
// state: { options (of the device now), newItem (a device being added), bus (the one it is on) }
export function devicePreview(check, state, t) {
	const profile = (check && check.profile) || {}
	const device = profile.device || {}
	const params = profile.params || []
	const alarms = profile.alarms || []
	const plan = profilePlan(check, state.options)
	const rows = []
	rows.push({ label: t('profile_row_device'), value: nameOf(device) || '--' })
	if (state.newItem && device.address) {
		rows.push({ label: t('profile_row_address'), value: String(device.address) })
	}
	rows.push({ label: t('profile_row_parameters'), value: t('profile_row_parameters_value', { n: params.length, watched: plan.watched.length }) })
	rows.push({ label: t('profile_row_alarms'), value: String(alarms.length) + (profile.alarm ? ' (' + t('alarm_code_in_register', { n: profile.alarm.record }) + ')' : '') })
	plan.watched.slice(0, LISTED).forEach(r => {
		const mine = plan.replaced.some(x => key(x) === key(r))
		rows.push({ label: t('profile_row_register', { n: r.record, f: r.func || 3 }), value: (r.name || '') + (mine ? ' ' + t('profile_row_replaces') : '') })
	})
	if (plan.watched.length > LISTED) {
		rows.push({ label: '', value: t('profile_row_more', { n: plan.watched.length - LISTED }) })
	}
	rows.push({ label: t('profile_row_kept'), value: String(plan.kept.length) })
	rows.push({ label: t('profile_row_after'), value: t('profile_row_after_value') })
	const warnings = []
	const loaded = state.options && state.options.profile_device
	if (loaded) {
		warnings.push(t('profile_replaces_loaded', { name: nameOf(loaded.device) || t('profile_loaded') }))
	}
	const bus = busMismatch(device, state.bus)
	if (bus) {
		warnings.push(t('bus_mismatch', bus))
	}
	if (!params.length && !alarms.length) {
		warnings.push(t('profile_empty'))
	}
	const notices = check.notices || []
	notices.slice(0, LISTED).forEach(n => warnings.push(String(n)))
	if (notices.length > LISTED) {
		warnings.push(t('and_n_more_warnings', { n: notices.length - LISTED }))
	}
	return { rows, warnings, blockers: [] }
}

// The import of a device profile, for DeviceEditor.vue: the file is read and checked as a Workshop file, the service checks the profile (read
// only), the person sees the preview, and only Apply loads it into the editor. The page gives what it owns in `ctx`:
//   exchangeImport  the shared flow (data-exchange-ui.js)         check(data)  async: rs485.profile_check -> { profile, notices, options }
//   model           object model of DWC                           state()      { options, newItem, bus } of the device editor NOW
//   t               translator (keys relative to deviceEditor)    busy(on)     the page's busy mark while the service is asked
//   apply(check)    loads the checked profile into the editor      notify(text, ok)  the page's message line
export function importDeviceProfile(ctx) {
	let checked = null
	return ctx.exchangeImport({
		what: ctx.t('profile_noun'),
		spec: DEVICE_SPEC,
		model: ctx.model,
		preview: async (data) => {
			ctx.busy(true)
			try {
				checked = await ctx.check(data)
			} catch (e) {
				throw new Error(ctx.t('could_not_import', { error: (e && e.message) || String(e) }))
			} finally {
				ctx.busy(false)
			}
			return devicePreview(checked, ctx.state(), ctx.t)
		},
		apply: async () => ctx.apply(checked),
		notify: ctx.notify
	})
}
