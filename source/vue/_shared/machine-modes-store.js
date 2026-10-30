'use strict'

// Reads and writes the answer to "which modes does this machine use?" (the pure rules are in machine-modes.js).
//   const s = await loadModes()            -> { state, detected, profile, viaService }
//   await saveModes({ fff: true, laser: true, cnc: false }, s.profile)    -> { viaService }
// The answer lives in the machine profile of the service (mode_policies.<mode>.enabled, central API profile.set: no custom
// M-codes). If the service has no profile operation, or refuses it (role), the answer is kept in this browser and the cards
// work the same; they say so (viaService false).

import { workshopProfile } from './machine-profile.js'
import { api } from './workshop-api.js'
import { detectModes, modesFromProfile, modesState, profileChanges, callsAutoModeSelect, MODES } from './machine-modes.js'

const LOCAL_KEY = 'workshopMachineModes'

function readLocal() {
	try {
		const v = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null')
		if (v && typeof v === 'object') return v
	} catch (e) {
		/* no storage: the question is asked again */
	}
	return null
}

function writeLocal(answer) {
	try {
		localStorage.setItem(LOCAL_KEY, JSON.stringify(answer))
	} catch (e) {
		/* not critical */
	}
}

export async function loadModes(force) {
	const snap = await workshopProfile.get(force)
	const viaService = !!snap.loaded
	const fromProfile = viaService ? modesFromProfile(snap.profile) : null
	return { state: modesState(fromProfile, readLocal()), detected: detectModes(snap.caps), profile: viaService ? snap.profile : null, viaService }
}

// answer: { fff, laser, cnc } booleans. Tries the service first, then the browser.
export async function saveModes(answer, profile) {
	const clean = {}
	MODES.forEach(m => {
		clean[m] = answer[m] === true
	})
	try {
		await api('profile.set', { changes: profileChanges(clean, profile) })
		workshopProfile.reset()
		writeLocal(clean)
		return { viaService: true }
	} catch (e) {
		writeLocal(clean)
		return { viaService: false }
	}
}

// text of a file of the machine; null when it does not exist; throws on any other error
export async function readMachineFile(path) {
	const r = await fetch('/machine/file/' + encodeURI(path).replace(/#/g, '%23'), { cache: 'no-store' })
	if (r.status === 404) return null
	if (!r.ok) throw new Error('HTTP ' + r.status)
	return r.text()
}

// The files the mode rows are about and whether config.g calls the saved mode. defs = the mode rows ({file}); a file that
// could not be read is left out (its row then has no state: nothing is guessed). -> { texts: {'0:/path': text|null}, bootCalls }
export async function readModeFacts(defs) {
	const texts = {}
	await Promise.all((defs || []).filter(d => d.file).map(async d => {
		try {
			texts['0:/' + d.file] = await readMachineFile('0:/' + d.file)
		} catch (e) {
			/* not read */
		}
	}))
	let bootCalls = null
	try {
		bootCalls = callsAutoModeSelect(await readMachineFile('0:/sys/config.g'))
	} catch (e) {
		/* no row for config.g */
	}
	return { texts, bootCalls }
}
