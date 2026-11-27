'use strict'

// The one place of this browser tab where a pop-up message of the family is shown (3.6 line, vue/_shared36): the alerts of Model and the notices of
// Activity ("this device" destination) go through it, so they share the options the person chose (style, corner, wait or not, how many wait), the
// cards never pile up on top of each other and the cap of waiting messages counts all of them. The messages come from `fire(id, title, message)`: one
// message per id (a new one replaces it), at most `max` waiting, the rest folded into one counting summary (toast-popups.js). The card is plain DOM
// (toast-view.js) or DWC's own notification (the host does that one: it prints HTML, so it escapes the texts). Kept on `window`.
// WorkshopModel/dwc36/test/notice-center.test.js runs it in node over a fake of the page.

import { createPopups } from './toast-popups.js'
import { createToastView } from './toast-view.js'
import { readToastOptions } from './toast-options.js'

const KEY = '__workshopNoticeCenter'

// the page is dark when Vuetify says so (the root of DWC carries theme--dark)
export function pageIsDark(doc) {
	const root = doc && doc.querySelector ? doc.querySelector('.v-application') : null
	return !!(root && root.classList.contains('theme--dark'))
}

// the side menu of DWC, when it is open on the left, is a place a card must not cover: the left corner starts at its edge
export function menuInset(doc) {
	const nav = doc && doc.querySelector ? doc.querySelector('.v-navigation-drawer--open') : null
	if (!nav) return 0
	const r = nav.getBoundingClientRect()
	return r.width > 0 && r.left <= 0 ? Math.max(0, r.right) : 0
}

// env: { doc, storage, labels() -> { close, region, moreTitle, moreText(n) }, showDwc(type, title, message, sticky) -> notification | null  (raw texts: the
//        host escapes them), dark(), inset(), later(fn, ms), cancel(id), now() }
export function createNoticeCenter(env) {
	let view = null
	const options = () => readToastOptions(env.storage)
	const dark = env.dark || (() => pageIsDark(env.doc))
	const inset = env.inset || (() => menuInset(env.doc))

	function ownView() {
		if (!view) {
			view = createToastView({
				doc: env.doc,
				labels: () => ({ close: env.labels().close, region: env.labels().region }),
				position: () => options().position,
				dark,
				inset,
				later: env.later,
				cancel: env.cancel,
				now: env.now
			})
		}
		return view
	}

	// the message in the style the person chose: DWC's notification, or the own card (plain DOM, text as text)
	function show(type, title, message, sticky) {
		if (options().style === 'dwc' && typeof env.showDwc === 'function') return env.showDwc(type, title, message, sticky)
		try {
			return ownView().show(type, title, message, sticky)
		} catch (e) {
			console.warn('[notice-center] message not shown:', e)
			return null
		}
	}

	const popups = createPopups({ show })

	return {
		options,
		show,
		// opts.type: 'warning' (default) or 'info'
		fire(id, title, message, opts) {
			const o = options()
			const l = env.labels()
			return popups.fire(id, title, message, {
				sticky: o.sticky,
				max: o.max,
				type: opts && opts.type,
				summaryTitle: l.moreTitle,
				summaryText: l.moreText
			})
		},
		closeAll: () => popups.closeAll(),
		get count() { return popups.count }
	}
}

// the one of this browser tab: the first plugin that asks creates it (with its texts and its DWC door), the others take it
export function sharedNoticeCenter(env) {
	const w = typeof window === 'undefined' ? null : window
	if (!w) return createNoticeCenter(env)
	if (!w[KEY]) w[KEY] = createNoticeCenter(env)
	return w[KEY]
}
