'use strict'

// A touch on something that needs a session (and nobody is signed in): no dialog, no card. The sign-in chip of the page bar and the session
// notes blink (family.css .is-attention); if the chip is out of view the page first scrolls up to it. Returns true when something blinked.
// The JS plugins have the same function (src/_shared/09-session-notice.js workshopSessionAttention).
const TARGETS = {
	session: '.wf-session-chip:not(.is-role), .wf-notice--session, .wf-reason--session, .wf-cover--session',
	role: '.wf-session-chip.is-role, .wf-notice--role, .wf-reason--role, .wf-cover--role'
}
// a read the page makes by itself when it opens: a role that cannot read it is told by the notes of the page, never by a card
const READ_OP = /(^|[._])(get|list|read|status|state|info|history|report|summary|snapshot|stats?|usage|check|probe|detect)(\.|_|$)/
export function isReadOp(op) {
	return READ_OP.test(String(op || ''))
}

function offScreen(el) {
	const r = el.getBoundingClientRect()
	return r.bottom < 0 || r.top > (window.innerHeight || document.documentElement.clientHeight)
}

export function attentionSession(kind = 'session') {
	if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return false
	const list = Array.from(document.querySelectorAll(TARGETS[kind] || TARGETS.session))
	if (!list.length) return false
	const chip = list.find(el => el.classList.contains('wf-session-chip'))
	if (chip && offScreen(chip) && typeof chip.scrollIntoView === 'function') chip.scrollIntoView({ behavior: 'smooth', block: 'center' })
	list.forEach(el => {
		el.classList.remove('is-attention')
		void el.offsetWidth // restarts the animation when touched twice in a row
		el.classList.add('is-attention')
		setTimeout(() => el.classList.remove('is-attention'), 1800)
	})
	return true
}
