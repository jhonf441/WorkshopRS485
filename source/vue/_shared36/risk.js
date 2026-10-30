// Confirmation of a risky action (level 3 of DESIGN.md section 5) for the Vue pages.
// The warning box is built by the hand-written JS plugins (window.__workshop.confirmRisk, src/_shared). The service page does
// not set it, so a machine with only Vue plugins has no such box. Without it the action must NOT go ahead silently, and DESIGN.md
// forbids the browser's own confirm dialog (it behaves badly on the touch kiosk): a small box of the same look is built here instead.
// Resolves true when the person accepts.
import { ts } from './shared-t.js'

function askInPage(opts) {
	return new Promise(resolve => {
		const el = (tag, css, text) => {
			const e = document.createElement(tag)
			if (css) e.style.cssText = css
			if (text != null) e.textContent = text
			return e
		}
		const back = el('div', 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;padding:16px;')
		back.setAttribute('data-workshop-risk', '1')
		const box = el('div', 'background:#1e272c;color:#eceff1;border:1px solid rgba(255,255,255,0.12);border-left:4px solid #e65100;border-radius:6px;max-width:420px;width:100%;padding:14px 16px;font-size:14px;line-height:1.45;box-shadow:0 8px 30px rgba(0,0,0,0.5);')
		box.setAttribute('role', 'alertdialog')
		box.setAttribute('aria-modal', 'true')
		box.setAttribute('aria-label', String(opts.title))
		const row = el('div', 'display:flex;gap:8px;justify-content:flex-end;margin-top:12px;')
		const cancel = el('button', 'background:#455a64;color:#fff;border:0;border-radius:6px;padding:8px 14px;min-height:44px;font-size:14px;cursor:pointer;', ts('risk_cancel'))
		const ok = el('button', 'background:#bf360c;color:#fff;border:0;border-radius:6px;padding:8px 14px;min-height:44px;font-size:14px;font-weight:600;cursor:pointer;', ts('risk_continue'))
		cancel.type = ok.type = 'button'
		const end = value => {
			document.removeEventListener('keydown', key, true)
			if (back.parentNode) back.parentNode.removeChild(back)
			resolve(value)
		}
		const key = ev => {
			if (ev.key === 'Escape') end(false)
		}
		cancel.addEventListener('click', () => end(false))
		ok.addEventListener('click', () => end(true))
		document.addEventListener('keydown', key, true)
		row.appendChild(cancel)
		row.appendChild(ok)
		box.appendChild(el('div', 'font-size:16px;font-weight:600;color:#ffb74d;margin-bottom:6px;', String(opts.title)))
		box.appendChild(el('div', null, String(opts.text)))
		box.appendChild(row)
		back.appendChild(box)
		;(document.fullscreenElement || document.body).appendChild(back)
		cancel.focus()
	})
}

export function confirmRisk(opts) {
	const t = typeof window !== 'undefined' ? window.__workshop : null
	if (t && typeof t.confirmRisk === 'function') return Promise.resolve(t.confirmRisk(opts))
	if (typeof document !== 'undefined' && document.body) return askInPage(opts)
	return Promise.resolve(false)
}
