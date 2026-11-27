'use strict'

// The own message of the family (3.6 line, vue/_shared36: the alerts of Model and the notices of Activity): a small card that slides in at a corner of any DWC page, made with plain DOM (it lives outside the Vue
// pages, started by the host of each plugin), as the alternative to DWC's own notification. A fire is `role="alert"` and the summary is
// `role="status"` so a screen reader says them; the Close button is 44 px; Escape closes the card that has the focus; a message that does not wait
// leaves by itself after TOAST_AUTO_MS, with a thin bar that shows the time and a pause while the pointer or the focus is on it; with "reduce motion"
// the card just appears. The texts go in as text, never as HTML. It keeps to a corner and never covers the middle of the page. `doc` and the timers come
// in from outside, so WorkshopModel/dwc36/test/alert-toast-view.test.js runs it over a small fake of the page.
//
// show(type, title, message, sticky) -> { title, message (settable), close() }, the shape toast-popups.js asks of a host.

export const TOAST_AUTO_MS = 10000
export const LEAVE_MS = 200
export const POSITIONS = ['left', 'center', 'right']

const ACCENT = { warning: '#f59e0b', info: '#3b82f6', success: '#22c55e', error: '#ef4444' }
const ICON = {
	warning: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z"/></svg>',
	info: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-6h2v6Zm0-8h-2V7h2v2Z"/></svg>'
}
const CLOSE_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="currentColor" d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41Z"/></svg>'

export const STYLE_ID = 'workshop-model-alert-toasts'
export const CSS = `
.wm-toasts { position: fixed; bottom: 16px; z-index: 2400; display: flex; flex-direction: column; gap: 10px; width: min(380px, calc(100vw - 32px)); pointer-events: none; font-family: inherit; }
.wm-toasts.pos-left { left: 16px; }
.wm-toasts.pos-right { right: 16px; }
.wm-toasts.pos-center { left: 50%; transform: translateX(-50%); }
.wm-toast { --wm-accent: #f59e0b; position: relative; pointer-events: auto; display: grid; grid-template-columns: 40px 1fr var(--wf-hit, 40px); align-items: start; gap: 2px 12px; padding: 12px 6px 12px 14px; overflow: hidden; border-radius: 14px; background: #ffffff; color: #1f2937; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.28), 0 1px 3px rgba(15, 23, 42, 0.2); border-left: 5px solid var(--wm-accent); animation: wm-in 0.28s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
.wm-toasts.is-dark .wm-toast { background: #2a2e35; color: #f3f4f6; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.06); }
.wm-toast.is-leaving { animation: wm-out 0.2s ease-in both; }
.wm-toast-icon { grid-row: 1 / span 2; display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; color: var(--wm-accent); background: color-mix(in srgb, var(--wm-accent) 18%, transparent); }
.wm-toast-title { align-self: end; display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; margin: 0; min-height: 22px; font-size: 14px; font-weight: 700; line-height: 1.3; }
.wm-toast-time { font-size: 12px; font-weight: 400; opacity: 0.6; }
.wm-toast-message { grid-column: 2; margin: 0; padding-bottom: 4px; font-family: var(--tp-font-mono, ui-monospace, Menlo, Consolas, monospace); font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; opacity: 0.92; }
.wm-toast-close { grid-column: 3; grid-row: 1 / span 2; align-self: start; display: inline-flex; align-items: center; justify-content: center; width: var(--wf-hit, 40px); height: var(--wf-hit, 40px); margin: -6px 0 0; padding: 0; border: 0; border-radius: 50%; background: transparent; color: inherit; cursor: pointer; opacity: 0.7; transition: background-color 0.15s ease, opacity 0.15s ease; }
.wm-toast-close:hover { opacity: 1; background: rgba(127, 127, 127, 0.18); }
.wm-toast-close:focus-visible { opacity: 1; outline: 2px solid var(--wm-accent); outline-offset: -2px; }
.wm-toast-bar { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: var(--wm-accent); transform-origin: left; animation: wm-bar var(--wm-auto, 10s) linear both; }
.wm-toast:hover .wm-toast-bar, .wm-toast:focus-within .wm-toast-bar { animation-play-state: paused; }
@keyframes wm-in { from { opacity: 0; transform: translateX(-24px) scale(0.97); } to { opacity: 1; transform: none; } }
@keyframes wm-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateX(-24px) scale(0.97); } }
@keyframes wm-bar { from { transform: scaleX(1); } to { transform: scaleX(0); } }
.wm-toasts.pos-right .wm-toast { animation-name: wm-in-right; }
.wm-toasts.pos-right .wm-toast.is-leaving { animation-name: wm-out-right; }
@keyframes wm-in-right { from { opacity: 0; transform: translateX(24px) scale(0.97); } to { opacity: 1; transform: none; } }
@keyframes wm-out-right { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateX(24px) scale(0.97); } }
@media (prefers-reduced-motion: reduce) { .wm-toast, .wm-toast.is-leaving { animation: none; } .wm-toast.is-leaving { display: none; } .wm-toast-bar { animation: none; transform: none; opacity: 0.5; } }
`

function clock(now) {
	const d = new Date(now)
	const p = n => String(n).padStart(2, '0')
	return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds())
}

// env: { doc, labels() -> { close, region }, position() -> 'left' | 'center' | 'right', dark() -> boolean,
//        inset() -> px the left corner keeps clear (the open menu of DWC), now(), later(fn, ms) -> id, cancel(id), autoMs }
export function createToastView(env) {
	const doc = env.doc
	const later = env.later || ((fn, ms) => setTimeout(fn, ms))
	const cancel = env.cancel || (id => clearTimeout(id))
	const now = env.now || (() => Date.now())
	const autoMs = env.autoMs || TOAST_AUTO_MS
	let box = null

	function ensureBox() {
		if (!doc.getElementById(STYLE_ID)) {
			const st = doc.createElement('style')
			st.id = STYLE_ID
			st.textContent = CSS
			doc.head.appendChild(st)
		}
		if (!box || !box.isConnected) {
			box = doc.createElement('div')
			box.setAttribute('role', 'region')
			doc.body.appendChild(box)
		}
		const pos = POSITIONS.indexOf(env.position()) >= 0 ? env.position() : 'left'
		box.className = 'wm-toasts pos-' + pos + (env.dark() ? ' is-dark' : '')
		// the left corner starts after the open side menu, so a card never covers its last entries
		const inset = pos === 'left' && typeof env.inset === 'function' ? Math.max(0, Math.round(Number(env.inset()) || 0)) : 0
		if (inset > 0) box.style.setProperty('left', 16 + inset + 'px')
		else box.style.removeProperty('left')
		box.setAttribute('aria-label', env.labels().region)
		return box
	}

	function el(tag, cls, parent) {
		const e = doc.createElement(tag)
		if (cls) e.className = cls
		if (parent) parent.appendChild(e)
		return e
	}

	function show(type, title, message, sticky) {
		const host = ensureBox()
		const kind = ICON[type] ? type : 'warning'
		const card = el('div', 'wm-toast')
		card.setAttribute('role', kind === 'info' ? 'status' : 'alert')
		card.setAttribute('aria-atomic', 'true')
		card.style.setProperty('--wm-accent', ACCENT[kind])
		const icon = el('span', 'wm-toast-icon', card)
		icon.innerHTML = ICON[kind]
		const head = el('p', 'wm-toast-title', card)
		const titleEl = el('span', '', head)
		titleEl.textContent = title
		const time = el('span', 'wm-toast-time', head)
		time.textContent = clock(now())
		const body = el('p', 'wm-toast-message', card)
		body.textContent = message
		const closeBtn = el('button', 'wm-toast-close', card)
		closeBtn.setAttribute('type', 'button')
		closeBtn.setAttribute('aria-label', env.labels().close)
		closeBtn.setAttribute('title', env.labels().close)
		closeBtn.innerHTML = CLOSE_ICON

		let closed = false
		let timer = null
		const note = {
			type,
			get title() { return titleEl.textContent },
			get message() { return body.textContent },
			set message(v) { body.textContent = v },
			// the Close button, Escape and the timer all call note.close(), which toast-popups.js may have wrapped to free the place
			close() {
				if (closed) return
				closed = true
				if (timer !== null) cancel(timer)
				card.classList.add('is-leaving')
				later(() => {
					if (card.parentNode) card.parentNode.removeChild(card)
				}, LEAVE_MS)
			}
		}
		closeBtn.addEventListener('click', () => note.close())
		card.addEventListener('keydown', e => {
			if (e.key === 'Escape') note.close()
		})
		if (!sticky) {
			card.style.setProperty('--wm-auto', autoMs / 1000 + 's')
			const bar = el('span', 'wm-toast-bar', card)
			bar.setAttribute('aria-hidden', 'true')
			const arm = ms => {
				timer = later(() => note.close(), ms)
			}
			arm(autoMs)
			// the time stops while the pointer or the focus is on the card, and starts again from the full time
			const hold = () => { if (timer !== null) { cancel(timer); timer = null } }
			const release = () => { if (!closed && timer === null) arm(autoMs) }
			card.addEventListener('mouseenter', hold)
			card.addEventListener('focusin', hold)
			card.addEventListener('mouseleave', release)
			card.addEventListener('focusout', release)
		}
		host.appendChild(card)
		return note
	}

	return { show }
}
