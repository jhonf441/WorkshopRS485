'use strict'

// A refused call told by its cause (ONE copy for every Vue plugin: it used to be session-note.js / session-now.js / refusal-kind.js / refusal-cause.js
// in four plugins, then refusal.js / agent-error.js / refused-texts.js in four more). The sentence is the standard one of notice-kind.js (noticeText),
// never a second set of texts. A page keeps the ERROR it got and calls these in a computed, so the sentence follows the role and the language.
// Test: tests/session-refusal.test.js.
//
//   isRefusal(e)                   true when the service refused the call for who the person is: 403 (role) or 401 (no session)
//   refusalKind(e, out)            'session' | 'role' | '' (not a refusal: the page keeps its own error); out = nobody is signed in now
//   refusalText(e, need, who)      the sentence by cause; who = { signedOut, role, t, action, state }; '' when e is not a refusal. Pure
//   refusalNow(e, need, action)    the same with the identity of this moment and the shared texts; action = what was refused ("Saving the zones")
//   refusalCauseNow(e)             refusalKind with the identity of this moment
//   failureOf(e, label, action)    what a page stores for a failed action: { error, label, action }; label(message) = the sentence of a real failure; action = what
//                                  was being done, a text or a function returning it (so it follows the language): the 403 sentence names it
//   failureNow(f, need, action)    the text of a stored failure: the refusal sentence when it is one, else label(message of the error)
//   failureActionNow(f)            the action of a stored failure (for a <lock-reason :action>)
//   failureCauseNow(f)             the cause of a stored failure: 'session' | 'role' | '' (a real failure)
// The kind of the error is its code (friendly-error.js errorKind: 'forbidden' = role, 'login_required' = no session). An error may carry
// `action` (the page that raised it knows what it was doing) and, from the service, body.error.needed_role.

import { noticeText } from './notice-kind.js'
import { sessionState, signedOut, workshopRole } from './workshop-auth.js'
import { ts } from './shared-t.js'

const ROLE = 'forbidden'
const LOGIN = 'login_required'

export function isRefusal(e) {
	const code = e && e.code
	return code === ROLE || code === LOGIN
}

export function refusalKind(e, out) {
	if (!isRefusal(e)) return ''
	// a 401 is always "no session"; a 403 while nobody is signed in too (signing in may fix it)
	return e.code === LOGIN || out ? 'session' : 'role'
}

// the role the service says is needed (403 of the API), else the one the page knows
function neededOf(e, need) {
	const body = e && e.body && e.body.error
	return (body && body.needed_role) || need || 'technician'
}

export function refusalText(e, need, who) {
	const kind = refusalKind(e, who.signedOut)
	return kind ? noticeText(kind, { needed: neededOf(e, need), role: who.role, state: who.state, action: who.action || (e && e.action) || '' }, who.t) : ''
}

export function refusalNow(e, need, action) {
	return refusalText(e, need, { signedOut: signedOut(), role: workshopRole(), state: sessionState(), action, t: ts })
}

export function refusalCauseNow(e) {
	return refusalKind(e, signedOut())
}

export function failureOf(e, label, action) {
	return { error: e, label, action }
}

function actionOf(f, action) {
	if (action) return action
	return typeof f.action === 'function' ? f.action() : f.action || ''
}

export function failureNow(f, need, action) {
	if (!f) return ''
	const refused = refusalNow(f.error, need, actionOf(f, action))
	if (refused) return refused
	const m = (f.error && f.error.message) || String(f.error)
	return typeof f.label === 'function' ? f.label(m) : String(f.label || '') + m
}

export function failureActionNow(f) {
	return f ? actionOf(f, '') : ''
}

export function failureCauseNow(f) {
	return f ? refusalCauseNow(f.error) : ''
}
