'use strict'

// A refused call (no session, or a role too low) told apart from a real failure, so the page writes the cause next to the thing
// that did not work (owner rule of 2026-11-04: never an empty state, a spinner or "service not responding" for a refusal).
// Pure: the sentence of "no session" comes in as `signedOutText`; a 403 already carries its own translated message.
//
//   refusalKind(e)                    'signed_out' (401) | 'role' (403) | '' (anything else: a real failure)
//   refusalText(e, signedOutText, fallback)   the sentence of the cause, '' when e is not a refusal

export function refusalKind(e) {
	const code = e && e.code
	if (code === 'login_required') return 'signed_out'
	if (code === 'forbidden') return 'role'
	return ''
}

export function refusalText(e, signedOutText, fallback) {
	const kind = refusalKind(e)
	if (kind === 'signed_out') return signedOutText
	if (kind === 'role') return (e && e.message ? String(e.message) : '') || fallback || ''
	return ''
}
