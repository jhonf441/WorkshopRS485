'use strict';

// Start-up card, logic of the rows (2026-10-15). Same logic as tallerPuestaFilas / tallerPuestaResumen of
// src/_shared/16-startup.js (JS pages); tests/startup.test.js checks that both say the same.
//
// A row (def) has a file ({ id, archivo: 'macros/mode/selectfff.g' }: its state comes from examples.list) or a check
// ({ id, estado: 'configured' | 'missing' | 'na' }: the page decides). aplica: false = grey, "does not apply to your
// machine" (no strip, no camera, no meter: never an error). The states are the ones of the service (ejemplos.py):
//   configured (green), example (orange: all commented, still to configure), missing (red), session (blue: nobody is signed in, so it cannot be checked), na (grey).
// A sixth, decided HERE and not by the service: skipped ("I do not use it", neutral). A row is skipped when
//   - the person chose "Do not use" (its id is in omitted; the decision is kept, see StartupPanel.vue), or
//   - it is optional (def.optional) and still off / only the example: nobody asked for it, so it is not a step to do.
// A skipped row is never pending: it is not in "what is missing", the guide skips it and the count of "N of M ready" does not include it.
// An optional row that works counts as an extra (summary.extra), not as one of the M. An optional row the person turned on that is still
// incomplete is a real step (missing / example): they asked for it.
// A row that is configured stays configured even when its id is in omitted: it works, there is nothing to skip.

export const states = ['configured', 'example', 'missing', 'session', 'skipped', 'na'];

// files: [{file, state}] from examples.list, or null when the service did not answer.
// omitted: ids of the rows the person chose not to use.
// -> [{id, def, file, state, exists, hidden (= the person chose not to use it), optional, skipReason ('chosen' | 'default' | null), withoutData}]
export function startupRows(defs, files, omitted) {
	const list = Array.isArray(files) ? files : null;
	const hid = Array.isArray(omitted) ? omitted : [];
	return (defs || []).map(def => {
		const f = { id: def.id, def, file: def.file || null, state: 'na', exists: false, hidden: hid.indexOf(def.id) >= 0, optional: def.optional === true, skipReason: null, withoutData: false };
		if (def.applies === false) return f;
		if (def.state !== undefined && def.state !== null) {
			f.state = states.indexOf(def.state) >= 0 ? def.state : 'na';
		} else if (def.file) {
			if (list === null) {
				f.withoutData = true; // without the service there is nothing to say about a file
			} else {
				const hit = list.filter(a => a && a.file === def.file)[0];
				f.exists = !!hit;
				f.state = hit && (hit.state === 'configured' || hit.state === 'example') ? hit.state : 'missing';
			}
		}
		f.rawState = f.state; // what the machine says, before the decision: the service gets it and applies the same decisions itself
		// the decision: only what is still to do can be skipped
		if (!f.withoutData && (f.state === 'example' || f.state === 'missing' || f.state === 'session')) {
			if (f.hidden) {
				f.state = 'skipped';
				f.skipReason = 'chosen';
			} else if (f.optional && f.state === 'example') {
				f.state = 'skipped';
				f.skipReason = 'default';
			}
		}
		return f;
	});
}

// {total, pending, session, ready, skipped, extra} over the rows that apply (grey and without-data rows do not count).
// total = the rows that are steps of the person: skipped ones and optional ones that already work are not in it.
// pending = what the person can set up (missing or only the example); session = rows nobody could check because nobody is signed in: they are
// not "steps to do" (the header chip used to say "1 step pending" to a visitor), but nothing is ready while they are there.
// skipped = rows the person does not use (or optional ones that are off); extra = optional rows that work (a bonus, not part of the M).
export function startupSummary(rows) {
	const count = (rows || []).filter(f => !f.withoutData && f.state !== 'na');
	const skipped = count.filter(f => f.state === 'skipped').length;
	const extra = count.filter(f => f.optional && f.state === 'configured').length;
	const steps = count.filter(f => f.state !== 'skipped' && !(f.optional && f.state === 'configured'));
	const pending = steps.filter(f => f.state === 'example' || f.state === 'missing').length;
	const session = steps.filter(f => f.state === 'session').length;
	const unchecked = steps.filter(f => f.state === 'unchecked').length; // could not be read now (same field as the JS card, src/_shared/16-startup.js)
	return { total: steps.length, pending: pending, session: session, unchecked: unchecked, ready: pending === 0 && session === 0 && unchecked === 0, skipped: skipped, extra: extra };
}
