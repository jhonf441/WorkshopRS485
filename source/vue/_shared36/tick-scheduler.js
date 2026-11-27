'use strict'

// One clock of one second for every watcher of the family on a page of DWC (3.6 line, vue/_shared36): the alerts of Model and the notices of
// Activity ask for their turn here instead of each starting its own timer, so there is one timer per browser tab however many plugins watch. It is
// kept on `window`, so the bundles of the plugins share it. A job runs every `ms` (rounded up to whole seconds); the clock stops when nobody is
// left. A job that throws does not stop the others. `env` comes in so WorkshopModel/dwc36/test/tick-scheduler.test.js runs it in node.

export const TICK_MS = 1000
const KEY = '__workshopTickScheduler'

// env: { setTimer(fn, ms) -> id, clearTimer(id) }
export function createScheduler(env) {
	const setT = (env && env.setTimer) || ((fn, ms) => setInterval(fn, ms))
	const clearT = (env && env.clearTimer) || (id => clearInterval(id))
	const jobs = new Map() // id -> { fn, every }
	let seq = 0
	let timer = null
	let ticks = 0

	function run() {
		ticks++
		jobs.forEach(job => {
			if (ticks % job.every !== 0) return
			try { job.fn() } catch (e) { /* a watcher that fails must not stop the others */ }
		})
	}

	return {
		get size() { return jobs.size },
		get running() { return timer !== null },
		// -> the id to give to remove()
		every(fn, ms) {
			const every = Math.max(1, Math.ceil((Number(ms) || TICK_MS) / TICK_MS))
			const id = ++seq
			jobs.set(id, { fn, every })
			if (timer === null) timer = setT(run, TICK_MS)
			return id
		},
		remove(id) {
			jobs.delete(id)
			if (jobs.size === 0 && timer !== null) {
				clearT(timer)
				timer = null
				ticks = 0
			}
		}
	}
}

// the one of this browser tab
export function sharedScheduler(win) {
	const w = win || (typeof window === 'undefined' ? null : window)
	if (!w) return createScheduler()
	if (!w[KEY]) w[KEY] = createScheduler()
	return w[KEY]
}
