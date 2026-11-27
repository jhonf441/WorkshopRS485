'use strict'

// The pop-up messages of the family (3.6 line, vue/_shared36: the alerts of Model and the notices of Activity share it): what waits on the screen and how many. A fire of a rule replaces the message that rule left (one
// message per rule, not one per crossing); at most `max` messages wait at once, and the oldest one that does not fit is folded into ONE summary message
// ("N more alerts") that counts up, so a burst never piles up a long queue (DWC shows its notifications one after the other). With `sticky` a message
// waits until the person closes it, so an alert is never missed because nobody was looking; without it DWC removes it by itself. Closing a message,
// from DWC's button or from here, frees its place. The messages come from `host.show(type, title, message, sticky)` -> a notification with close()
// or null. Nothing is written to the console here (the host does). Pure: WorkshopModel/dwc36/test/alert-popups.test.js.

export function createPopups(host) {
	const open = new Map() // rule id -> notification, oldest first
	let summary = null
	let overflow = 0

	// the notification's own close() also frees the place, whoever calls it (the Close button of DWC, the timeout of a non-sticky message, us)
	function track(note, onClosed) {
		if (!note) return null
		const original = typeof note.close === 'function' ? note.close.bind(note) : () => {}
		note.close = () => {
			onClosed(note)
			original()
		}
		return note
	}

	function showSummary(opts) {
		const text = opts.summaryText(overflow)
		if (summary) {
			summary.message = text
			return
		}
		summary = track(host.show('info', opts.summaryTitle, text, true), () => {
			summary = null
			overflow = 0
		})
	}

	return {
		get count() { return open.size },
		get overflow() { return overflow },
		get hasSummary() { return summary !== null },
		// opts: { sticky, max, summaryTitle, summaryText(n), type: 'warning' (default) | 'info' }
		fire(id, title, message, opts) {
			const max = Math.max(1, Number(opts.max) || 1)
			if (open.has(id)) open.get(id).close()
			const note = track(host.show(opts.type === 'info' ? 'info' : 'warning', title, message, opts.sticky), n => {
				if (open.get(id) === n) open.delete(id)
			})
			if (!note) return false
			open.set(id, note)
			let folded = false
			while (open.size > max) {
				const oldest = open.values().next().value
				overflow++
				folded = true
				oldest.close()
			}
			if (folded) showSummary(opts)
			return true
		},
		closeAll() {
			Array.from(open.values()).forEach(n => n.close())
			if (summary) summary.close()
		}
	}
}
