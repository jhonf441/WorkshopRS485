'use strict';

// Start-up card, logic of the rows (2026-10-15). Same logic as tallerPuestaFilas / tallerPuestaResumen of
// src/_shared/16-startup.js (JS pages); tests/startup.test.js checks that both say the same.
//
// A row (def) has a file ({ id, archivo: 'macros/mode/selectfff.g' }: its state comes from examples.list) or a check
// ({ id, estado: 'configured' | 'missing' | 'na' }: the page decides). aplica: false = grey, "does not apply to your
// machine" (no strip, no camera, no meter: never an error). The states are the ones of the service (ejemplos.py):
//   configured (green), example (orange: all commented, still to configure), missing (red), na (grey).

export const states = ['configured', 'example', 'missing', 'na'];

// archivos: [{archivo, estado}] from examples.list, or null when the service did not answer.
// ocultos: ids of the rows the person hid.
// -> [{id, def, archivo, estado, existe, oculta, sinDatos}]
export function startupRows(defs, files, hidden) {
	const list = Array.isArray(files) ? files : null;
	const hid = Array.isArray(hidden) ? hidden : [];
	return (defs || []).map(def => {
		const f = { id: def.id, def, file: def.file || null, state: 'na', exists: false, hidden: hid.indexOf(def.id) >= 0, withoutData: false };
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
		return f;
	});
}

// {total, pendientes, listo} over the rows that are shown and apply (hidden, grey and without-data rows do not count)
export function startupSummary(rows) {
	const count = (rows || []).filter(f => !f.hidden && !f.withoutData && f.state !== 'na');
	const pending = count.filter(f => f.state === 'example' || f.state === 'missing').length;
	return { total: count.length, pending: pending, ready: pending === 0 };
}
