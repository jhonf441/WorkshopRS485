'use strict'

// The rules of the T3D servo parameter panel (ParamsT3d.vue, ParamCard.vue) that do not need Vue: how a stored value is shown, what the
// manual allows, which parameters matter in the mode the servo is in. Plain functions of their arguments, the same file in both DWC lines,
// run by test/params-model.test.js. The texts come in as `t(key, params)`, a translator whose keys are relative to
// plugins.WorkshopRS485.paramsT3d (the page passes its own), so this file asks for no catalog.

// The drive has registers 0-255 (P-000 to P-255). One that does not exist answers NO_EXISTE (0x5A53); the others not in the manual are factory ones.
export const TOTAL = 256
export const BY_READING = 16

// 7 -> "007"
export function three(n) {
	return ('00' + n).slice(-3)
}

// Vuetify 2 class names sent by the backend ("cyan darken-1") -> Vuetify 4 ("cyan-darken-1")
export function vcolor(col) {
	return String(col || '').trim().replace(/\s+/g, '-')
}

export function bgClass(col) {
	return 'bg-' + vcolor(col)
}

export function unitOf(p) {
	return p.unit_scale || p.unit || ''
}

// A stored value as the person reads it (the parameter's scale applied)
export function show(p, v) {
	if (v == null || v === '') {
		return v
	}
	return p.scale && p.scale !== 1 ? (Number(v) * p.scale).toFixed(1) : v
}

export function textOption(p, v) {
	const o = (p.options || []).find(x => x.value === v)
	return o ? o.text : ''
}

// where a value falls between the minimum and the maximum of the parameter, in percent
export function posSpan(p, v) {
	const span = p.max - p.min
	return span > 0 ? Math.max(0, Math.min(100, (v - p.min) / span * 100)) : 50
}

// The letters (P position, S speed, T torque) a servo control mode P-004 applies: 0 position (normal with the Duet), 1 speed, 2 torque, 3-5 mixed
export function modeLetters(modeServo) {
	return { 0: ['P'], 1: ['S'], 2: ['T'], 3: ['P', 'S'], 4: ['P', 'T'], 5: ['S', 'T'] }[modeServo]
}

// Does the parameter matter in the mode the servo is in? (the Duet controls the servo by pulses: position)
export function modeUsed(p, modeServo) {
	if (!p.mode || modeServo == null) {
		return true
	}
	const letters = modeLetters(modeServo)
	return !letters || p.mode === 'ALL' || letters.some(l => p.mode.split(',').includes(l))
}

// "P,S" -> "position, speed"
export function textMode(mode, t) {
	const names = { P: t('mode_position'), S: t('mode_speed'), T: t('mode_torque'), ALL: t('mode_all') }
	return mode.split(',').map(x => names[x] || x).join(', ')
}

// What the manual says about a value for a documented parameter (the same rule as the backend's t3d_params.validate()): the reason, or null
export function validate(p, n, t) {
	if (p.kind !== 'doc') {
		return null
	}
	if (!Number.isInteger(n)) {
		return t('must_be_a_whole_number')
	}
	if (n < p.min || n > p.max) {
		return t('out_of_range', { min: show(p, p.min), max: show(p, p.max) })
	}
	for (const d of p.digits || []) {
		const dig = Math.floor(Math.abs(n) / Math.pow(10, d.position)) % 10
		if (dig > d.max) {
			return t('invalid_digit', { d: dig, where: d.text.split(':')[0], max: d.max })
		}
	}
	return null
}
