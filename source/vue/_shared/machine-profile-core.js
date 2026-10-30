'use strict'

// Machine profile as the pages see it: what the service says the machine HAS (capabilities.get, discovered from the
// board) and what its owner DECLARED (profile.get: macros by role, meter, currency...). Pure logic, no imports, so
// node tests load it; machine-profile.js wires it to the API. Same logic in src/_shared/07-profile.js for the JS
// plugins (tests/profile-pair.test.js runs both over the same scenarios): keep them equal.
//
//   const p = createProfile(fetchAll)       fetchAll() -> Promise<{profile: <profile.get>, caps: <capabilities.get>}>
//   await p.get()                           cached 60 s, one request at a time; never rejects (see p.error())
//   p.has('laser')                          true / false once known; `whenUnknown` (default false) before / without the service
//   p.macro('focus')                        path of the macro of that role, null if the file does not exist; generic default before
//   p.meterAvailable()                      true / false / null (null = not known yet: show the page as before)
//   p.currency()                            declared currency, '' when none
//
// A service older than this version has no profile.get: the profile stays unknown and nothing is hidden.

export const DEFAULT_MACROS = {
	focus: '0:/macros/focus.g', home: '0:/sys/homeall.g', light: '0:/macros/light.g',
	air: '0:/macros/air.g', shutdown: '0:/macros/shutdown.g', park: '0:/macros/park.g'
}
export const TTL_MS = 60000

export function createProfile(fetchAll, now) {
	const clock = now || (() => Date.now())
	const st = { loaded: false, at: 0, pending: null, view: null, caps: null, error: null }

	function get(force) {
		if (!force && st.loaded && clock() - st.at < TTL_MS) return Promise.resolve(snapshot())
		if (st.pending) return st.pending
		st.pending = Promise.resolve().then(fetchAll).then(r => {
			st.view = (r && r.profile) || null
			st.caps = (r && r.caps) || null
			st.loaded = !!(st.view && st.view.profile)
			st.error = null
			st.at = clock()
		}).catch(e => {
			st.error = e || new Error('profile unavailable')
		}).then(() => {
			st.pending = null
			return snapshot()
		})
		return st.pending
	}

	function snapshot() {
		return { loaded: st.loaded, profile: st.view && st.view.profile, caps: st.caps, error: st.error }
	}

	function has(name, whenUnknown) {
		const c = st.caps && st.caps.capabilities && st.caps.capabilities[name]
		if (!st.loaded || !c) return !!whenUnknown
		return !!c.present
	}

	function macro(role) {
		const resolved = st.view && st.view.resolved_macros
		if (st.loaded && resolved && role in resolved) return resolved[role] || null
		return DEFAULT_MACROS[role] || null
	}

	function meterAvailable() {
		if (!st.loaded) return null
		const c = st.caps && st.caps.capabilities && st.caps.capabilities.meter
		if (c && c.disabled_by_profile) return false
		if (c && c.present) return true
		const m = st.view.profile.meter
		return !!(m && m.kind && m.kind !== 'none')
	}

	function currency() {
		return (st.loaded && st.view.profile.currency) || ''
	}

	function axisIndex(letter) {
		const idx = st.view && st.view.axis_indexes
		return st.loaded && idx && idx[letter] !== undefined ? idx[letter] : null
	}

	function reset() {
		st.loaded = false; st.at = 0; st.view = null; st.caps = null; st.error = null
	}

	return { get, has, macro, meterAvailable, currency, axisIndex, snapshot, reset, error: () => st.error, loaded: () => st.loaded }
}
