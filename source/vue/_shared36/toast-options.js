'use strict'

// How a pop-up message behaves (3.6 line, vue/_shared36: the alerts of Model and the notices of Activity share one setting): it waits for the person to
// close it (so a message never passes unseen) and at most `max` wait at once (the rest are folded into one "more messages" message), in the style
// (the own card or DWC's notification) and the corner chosen. Kept in this browser. Pure: WorkshopModel/dwc36/test/alert-popups.test.js.

export const TOAST_OPTIONS_KEY = 'workshopModelAlertToastOptions'
export const TOAST_MAX_MIN = 1
export const TOAST_MAX_MAX = 10
export const TOAST_STYLES = ['own', 'dwc']
export const TOAST_POSITIONS = ['left', 'center', 'right']
export const TOAST_DEFAULTS = { sticky: true, max: 3, style: 'own', position: 'left' }

export function cleanToastOptions(o) {
	const raw = o ? o.max : undefined
	const n = raw === null || raw === undefined || raw === '' ? NaN : Math.round(Number(raw))
	return {
		sticky: !(o && o.sticky === false),
		max: Number.isFinite(n) ? Math.min(TOAST_MAX_MAX, Math.max(TOAST_MAX_MIN, n)) : TOAST_DEFAULTS.max,
		style: o && TOAST_STYLES.indexOf(o.style) >= 0 ? o.style : TOAST_DEFAULTS.style,
		position: o && TOAST_POSITIONS.indexOf(o.position) >= 0 ? o.position : TOAST_DEFAULTS.position
	}
}

export function readToastOptions(storage) {
	try {
		return cleanToastOptions(JSON.parse((storage && storage.getItem(TOAST_OPTIONS_KEY)) || 'null'))
	} catch (e) {
		return Object.assign({}, TOAST_DEFAULTS)
	}
}

export function saveToastOptions(storage, o) {
	try {
		storage.setItem(TOAST_OPTIONS_KEY, JSON.stringify(cleanToastOptions(o)))
		return true
	} catch (e) {
		return false
	}
}

// DWC prints the title and the message of its own notification as HTML, and the texts come from a rule typed by hand, the machine or the history
export function escapeHtml(text) {
	return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
