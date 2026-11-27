'use strict'

// ONE rule for "does this screen or button work in the mode the machine is in now?" (user request 2026-11-12, audit of the mode behaviour of every
// plugin). Before it each plugin invented its own: Printing greyed whole pages, the Workbench hid them, Machine and Motors said nothing. The rule
// separates three questions that were mixed in one:
//
//   unused     this machine does not use that mode (the profile of machine-modes.js is answered and none of `needs` is on): the section is NOT SHOWN.
//              It is a decision of the configuration, taken once; it never flickers with the mode.
//   elsewhere  the machine uses the mode but is in another one now: the screen STAYS, for reading; what moves or heats the machine is off, with the
//              reason written next to it (a disabled button shows no tooltip on touch screens).
//   unknown    the machine mode is not known (the model has not arrived): the screen stays and what ACTS is off (project rule 2026-11-10: deny what is
//              not known). Reading and navigation are never blocked by it.
//   ok         the machine is in a mode the screen needs.
//
// What is NOT a mode matter: stopping, pausing and cancelling a job are never blocked (stopping is always the safe thing), and the mode switch itself
// has its own rule (mode-switch.js: technician). Pure (no imports): tests/mode-gate.test.js loads it in node.
//
//   modeGate(needs, mode, modes)    needs = ['FFF'] | ['Laser', 'CNC'] ...; mode = currentMode(model); modes = modesState() of machine-modes.js or null
//                                   -> { state, show, canAct, needs, mode }
//   modeBlockKey(gate)              the text key (shared catalog) of the reason, '' when nothing blocks
//   modeBlockParams(gate)           its parameters: { needs, mode }
//   actionGate(needs, mode)         the gate of a BUTTON that acts: { allowed, key, params } (no profile: a button never hides)

const ID_OF = { FFF: 'fff', Laser: 'laser', CNC: 'cnc' }
const KNOWN = ['FFF', 'Laser', 'CNC']

// "Laser or CNC" for the texts
export function needsLabel(needs) {
	return (needs || []).join(' / ')
}

// is the mode on in the profile answer? modes = { answered, answer: { fff, laser, cnc } }
function usedBy(modes, name) {
	return !!(modes && modes.answer && modes.answer[ID_OF[name]])
}

export function modeGate(needs, mode, modes) {
	const want = (needs || []).filter(n => KNOWN.indexOf(n) >= 0)
	const base = { needs: want, mode: mode || '' }
	// the profile only HIDES when it is answered: an unanswered question never takes a section away
	if (modes && modes.answered && want.length && !want.some(n => usedBy(modes, n))) return Object.assign(base, { state: 'unused', show: false, canAct: false })
	if (!mode || KNOWN.indexOf(mode) < 0) return Object.assign(base, { state: 'unknown', show: true, canAct: false })
	if (want.indexOf(mode) < 0) return Object.assign(base, { state: 'elsewhere', show: true, canAct: false })
	return Object.assign(base, { state: 'ok', show: true, canAct: true })
}

export function modeBlockKey(gate) {
	if (!gate) return ''
	if (gate.state === 'elsewhere') return 'mode_needs_elsewhere'
	if (gate.state === 'unknown') return 'mode_needs_unknown'
	return ''
}

export function modeBlockParams(gate) {
	return { needs: needsLabel(gate && gate.needs), mode: (gate && gate.mode) || '?' }
}

// a button that acts (moves, heats, writes to the board): allowed only in the right mode
export function actionGate(needs, mode) {
	const g = modeGate(needs, mode, null)
	return { allowed: g.canAct, key: modeBlockKey(g), params: modeBlockParams(g) }
}
