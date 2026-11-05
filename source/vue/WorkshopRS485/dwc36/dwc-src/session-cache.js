'use strict'

// A cache of what a screen read, valid only while the SAME person (role and signed in/out) is the one who read it: when the identity
// changes the cache is dropped (ESTANDAR 3.1: nothing the previous person saw stays in memory).
//   const cache = createSessionCache()      cache.get(id) -> {}      cache.set(id, { ... })

import { workshopRole, signedOut } from './workshop-auth.js'
import { sessionKey } from './session-reset.js'

export function createSessionCache() {
	let store = {}
	let key = null
	const check = () => {
		const now = sessionKey(workshopRole(), signedOut())
		if (now !== key) {
			store = {}
			key = now
		}
	}
	return {
		get(id) {
			check()
			return store[id] || {}
		},
		set(id, value) {
			check()
			store[id] = value
		}
	}
}
