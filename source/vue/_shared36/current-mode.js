'use strict'

// The mode the machine is really in (FFF / Laser / CNC), ONE rule for every Vue plugin. Twin of workshopCurrentMode (src/_shared/07-modes.js) and of
// pick() in WorkshopService dsf/real_mode.py.
//
// state.machineMode is what RepRapFirmware applies (M451 FFF, M452 Laser, M453 CNC). global.selectedMode is a variable that the select*.g macros write
// BEFORE they run the M45x, so when the M45x fails the variable says one mode and the machine is in another. The machine is the truth:
// global.selectedMode is used only when the model has no known state.machineMode. Pure (no imports).

export const MODE_LIST = ['FFF', 'Laser', 'CNC']
// the modes the Workbench page serves (laser and CNC work)
export const WORKBENCH_MODES = ['Laser', 'CNC']

function read(obj, key) {
	if (!obj) return undefined
	return typeof obj.get === 'function' ? obj.get(key) : obj[key]
}

// The real mode of an object model: 'FFF' | 'Laser' | 'CNC', or '' when the model does not say.
export function currentMode(model) {
	const machine = read(read(model, 'state'), 'machineMode')
	if (MODE_LIST.indexOf(machine) >= 0) return machine
	const selected = read(read(model, 'global'), 'selectedMode')
	if (MODE_LIST.indexOf(selected) >= 0) return selected
	return ''
}

// true when a mode is known and the Workbench does not serve it (an unknown mode never blocks anything)
export function workbenchClosedIn(mode) {
	return !!mode && WORKBENCH_MODES.indexOf(mode) < 0
}
