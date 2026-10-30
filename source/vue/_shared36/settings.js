'use strict'

// Shared settings files with a revision (F1-B). The files every page edits (jog.json, laser.json, cameras.json,
// vision.json...) used to be read whole, changed and written whole: two people at the same time and the last one
// silently erased the other's work. The service now keeps a revision of each file (operations settings.get / settings.set):
//
//   import { settings } from './settings.js'
//   const { value, rev } = await settings.load('laser')
//   await settings.save('laser', cfg => { cfg.watts = 30 })   // the mutator changes the copy it is given (or returns a new value); resolves {value, rev}
//
// save() reads, applies the mutator, writes with the rev it read. If someone else saved in between ("conflict") it
// applies the mutator again over what the service answers and tries ONCE more; if that also conflicts it throws an
// ApiError with .code 'conflict' whose text is "Another person changed this: reload or save as a copy" (show e.message).
// Same logic for the JS plugins in src/_shared/02-settings.js: keep them equal (tests/settings-pair.test.js).

import { api, ApiError } from './workshop-api.js'
import { ts } from './shared-t.js'

export function makeSettings(call, conflictText, makeError) {
	const clone = v => (v === null || v === undefined ? {} : JSON.parse(JSON.stringify(v)));

	async function load(name) {
		const r = await call('settings.get', { name });
		return { value: r.value, rev: String(r.rev) };
	}

	function applied(mutator, value) {
		const draft = clone(value);
		const out = mutator(draft);
		return out === undefined ? draft : out;
	}

	// one attempt: { saved } when written, { current } when someone else saved first
	async function attempt(name, mutator, base) {
		const value = applied(mutator, base.value);
		try {
			const r = await call('settings.set', { name, value, base_rev: base.rev });
			return { saved: { value, rev: String(r.rev) } };
		} catch (e) {
			if (e && e.code === 'conflict') return { current: e.body && e.body.error && e.body.error.current };
			throw e;
		}
	}

	async function save(name, mutator) {
		const base = await load(name);
		const first = await attempt(name, mutator, base);
		if (first.saved) return first.saved;
		const cur = first.current ? { value: first.current.value, rev: String(first.current.rev) } : await load(name);
		const second = await attempt(name, mutator, cur);
		if (second.saved) return second.saved;
		throw makeError('conflict', conflictText(), second);
	}

	return { load, save };
}

export const settings = makeSettings(api, () => ts('settings_conflict'), (code, message, body) => new ApiError(code, message, 409, body));
