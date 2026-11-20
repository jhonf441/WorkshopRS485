'use strict'

// Vue 2 side of mode-gate.js (the rule is there). A component that needs a mode mixes this in:
//   mixins: [modeGateMixin]
//   this.machineMode                the real mode ('FFF' | 'Laser' | 'CNC' | '' when unknown): current-mode.js, state.machineMode first
//   this.gateOf(['FFF'])            { state, show, canAct, ... } of mode-gate.js with the profile answer of this machine
//   this.modeBlock(['FFF'])         the sentence that says why a button that acts is off ('' when it may act), shared catalog
// The profile answer (which modes the machine uses) is read once for the whole page and shared by every component.
// modeActionMixin is the light one for a component that only has BUTTONS that act: no profile read, no request: this.machineMode and
// this.modeBlock(needs) (the sentence that says why the button is off, '' when it may act; an unknown mode denies).

import { currentMode } from './current-mode.js'
import { modeGate, modeBlockKey, modeBlockParams, actionGate } from './mode-gate.js'
import { loadModes } from './machine-modes-store.js'
import { ts } from './shared-t.js'

let shared = null // { info, at } the answer read from the profile; null = not read
let pending = null
const MAX_AGE = 30000

function modesInfo() {
	if (shared && Date.now() - shared.at < MAX_AGE) return Promise.resolve(shared.info)
	if (!pending) {
		pending = loadModes(false).then(info => {
			shared = { info, at: Date.now() }
			return info
		}, () => null).then(info => {
			pending = null
			return info
		})
	}
	return pending
}

export const modeGateMixin = {
	data() {
		return { modeProfile: shared ? shared.info.state : null }
	},
	created() {
		modesInfo().then(info => {
			if (info) this.modeProfile = info.state
		})
	},
	computed: {
		machineMode() {
			const s = this.$store && this.$store.state
			return currentMode(s && s.machine && s.machine.model)
		}
	},
	methods: {
		gateOf(needs) {
			return modeGate(needs, this.machineMode, this.modeProfile)
		},
		modeBlock(needs) {
			const g = this.gateOf(needs)
			const key = modeBlockKey(g)
			return key ? ts(key, modeBlockParams(g)) : ''
		}
	}
}

export const modeActionMixin = {
	computed: {
		machineMode() {
			const s = this.$store && this.$store.state
			return currentMode(s && s.machine && s.machine.model)
		}
	},
	methods: {
		modeBlock(needs) {
			const g = actionGate(needs, this.machineMode)
			return g.allowed ? '' : ts(g.key, g.params)
		}
	}
}
