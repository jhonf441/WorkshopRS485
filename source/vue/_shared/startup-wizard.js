'use strict';

// Start-up assistant, PURE logic (2026-10-15). Same functions as src/_shared/16-startup-wizard.js (JS pages, named
// tallerPuestaXxx there); tests/startup.test.js checks that both say the same. If you change one, change the other.
// It decides: the walk over the pending rows, the validation of the answers, the preview of the file, the "never
// overwrite" policy and the check made after writing. Nothing here touches the screen or the machine.
// Docs: docs-internal/STARTUP-WIZARD.md.

// Optional explanation of a row (def.what / def.why / def.ifMissing are keys). null = the row has none.
export function startupExplanation(def) {
	if (!def || (!def.what && !def.why && !def.ifMissing)) return null;
	return { what: def.what || null, why: def.why || null, ifMissing: def.ifMissing || null };
}

// Ids of the rows the assistant walks over: only the red and orange ones that are shown and have data.
export function startupSteps(rows) {
	return (rows || []).filter(f => !f.hidden && !f.withoutData && (f.state === 'missing' || f.state === 'example')).map(f => f.id);
}

// State of a walk: {ids, i, fin, hechas, saltadas}. fin = past the last step (the summary is shown).
export function startupWizardStart(rows) {
	const ids = startupSteps(rows);
	return { ids, i: 0, end: ids.length === 0, done: [], skipped: [] };
}

// accion: 'siguiente' | 'anterior' | 'saltar' (next and remember it was skipped) | 'hecho' (next and remember it was done).
// Returns a new state; the old one is not changed.
export function startupWizardMove(est, action) {
	const n = { ids: est.ids.slice(), i: est.i, end: est.end, done: est.done.slice(), skipped: est.skipped.slice() };
	const id = n.ids[n.i];
	if (action === 'previous') {
		if (n.end) {
			n.end = false;
			n.i = Math.max(0, n.ids.length - 1);
		} else {
			n.i = Math.max(0, n.i - 1);
		}
		return n;
	}
	if (n.end || id === undefined) return n;
	if (action === 'skip' && n.skipped.indexOf(id) < 0) {
		n.skipped.push(id);
		n.done = n.done.filter(x => x !== id);
	} else if (action === 'done' && n.done.indexOf(id) < 0) {
		n.done.push(id);
		n.skipped = n.skipped.filter(x => x !== id);
	}
	if (n.i + 1 >= n.ids.length) n.end = true;
	else n.i += 1;
	return n;
}

// Summary of a walk against the rows read AGAIN afterwards: which ones are ready now and which are still pending.
// -> {recorridas, listas: [ids], pendientes: [ids], saltadas: [ids], listo}
export function startupWizardSummary(est, rows) {
	const byId = {};
	(rows || []).forEach(f => {
		byId[f.id] = f;
	});
	const lists = [];
	const pending = [];
	est.ids.forEach(id => {
		const f = byId[id];
		if (f && (f.state === 'missing' || f.state === 'example') && !f.hidden && !f.withoutData) pending.push(id);
		else lists.push(id);
	});
	return { traversed: est.ids.length, lists: lists, pending: pending, skipped: est.skipped.slice(), ready: pending.length === 0 };
}

// ---- questions of a row with assistant: { id, tipo: 'texto'|'numero'|'lista'|'si_no', etiqueta, ayuda, defecto,
//      opciones: [{valor, etiqueta}], min, max, entero, requerida, patron, si: {pregunta, valor | valor: [..]} } ----

export function startupVisible(preg, resp) {
	if (!preg.si) return true;
	const other = resp ? resp[preg.si.question] : undefined;
	const v = preg.si.value;
	return Array.isArray(v) ? v.indexOf(other) >= 0 : other === v;
}

// Answers with the default value of every question (what the form shows at the start).
export function startupAnswersInitial(questions) {
	const r = {};
	(questions || []).forEach(p => {
		if (p.defaultValue !== undefined) r[p.id] = p.defaultValue;
		else if (p.kind === 'si_no') r[p.id] = false;
		else if (p.kind === 'list' && p.options && p.options.length) r[p.id] = p.options[0].value;
		else r[p.id] = '';
	});
	return r;
}

// Checks the answers. -> {ok, errores: {id: key}, valores: {id: value}}. Numbers become numbers, yes/no become
// booleans, texts are trimmed. Questions that are not shown (si) are left out. Text can never carry quotes,
// semicolons or line breaks: an answer must not be able to add a line of its own to the file.
export function startupValidate(questions, resp) {
	const errors = {};
	const values = {};
	resp = resp || {};
	(questions || []).forEach(p => {
		if (!startupVisible(p, resp)) return;
		const v = resp[p.id];
		if (p.kind === 'si_no') {
			values[p.id] = v === true || v === 'true' || v === 'si' || v === 'yes' || v === 1;
			return;
		}
		if (p.kind === 'list') {
			const ok = (p.options || []).some(o => o.value === v);
			if (ok) values[p.id] = v;
			else errors[p.id] = 'startup.err_choice';
			return;
		}
		const s = v === undefined || v === null ? '' : String(v).trim();
		if (p.kind === 'number') {
			if (s === '') {
				errors[p.id] = 'startup.err_required';
				return;
			}
			const x = Number(s.replace(',', '.'));
			if (!isFinite(x)) errors[p.id] = 'startup.err_number';
			else if (p.integer && Math.floor(x) !== x) errors[p.id] = 'startup.err_integer';
			else if ((typeof p.min === 'number' && x < p.min) || (typeof p.max === 'number' && x > p.max)) errors[p.id] = 'startup.err_range';
			else values[p.id] = x;
			return;
		}
		// text
		if (s === '') {
			if (p.required === false) values[p.id] = '';
			else errors[p.id] = 'startup.err_required';
		} else if (/["\r\n;]/.test(s)) {
			errors[p.id] = 'startup.err_chars';
		} else if (p.pattern && !new RegExp(p.pattern).test(s)) {
			errors[p.id] = 'startup.err_pattern';
		} else {
			values[p.id] = s;
		}
	});
	return { ok: Object.keys(errors).length === 0, errors: errors, values: values };
}

// A line the machine would act on: not blank and not a comment.
export function startupLinesActive(text) {
	return String(text || '')
		.split(/\r?\n/)
		.filter(l => {
			const x = l.trim();
			return x !== '' && x.charAt(0) !== ';';
		}).length;
}

// Lines that move the machine. They are never written active by the assistant (see puestaVistaPrevia).
const move = /^G(0|1|2|3|28|29|30|32|53)(?![0-9])/i;

// The file as it would be written: asistente.template(valores) -> text, with every moving command commented and
// counted. -> {ok, errores, texto, activas, comentadas}
export function startupViewPreview(wizard, resp) {
	const v = startupValidate(wizard.questions, resp);
	if (!v.ok) return { ok: false, errors: v.errors, text: '', active: 0, commented: 0 };
	let comentadas = 0;
	const lines = String(wizard.template(v.values) || '')
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.map(l => {
			const x = l.trim();
			if (x.charAt(0) !== ';' && move.test(x)) {
				comentadas += 1;
				return '; (moves the machine - check it first) ' + x;
			}
			return l;
		});
	const text = lines.join('\n').replace(/\n+$/, '') + '\n';
	return { ok: true, errors: {}, text: text, active: startupLinesActive(text), commented: comentadas };
}

// Where the assistant writes: '0:/' + (asistente.destination || def.file).
export function startupDestination(def) {
	const rel = (def && def.wizard && def.wizard.destination) || (def && def.file) || '';
	return rel ? '0:/' + rel.replace(/^0:\/?/, '') : '';
}

function nameFree(path, sufijo, busy) {
	for (let n = 1; n < 100; n++) {
		const c = path + sufijo + (n === 1 ? '' : String(n));
		if (busy.indexOf(c) < 0) return c;
	}
	return path + sufijo + '-' + Date.now();
}

// The "never overwrite" policy. textoExistente = text of the file now (null = it does not exist);
// ocupadas = other paths that already exist (<ruta>.nuevo ...). -> {modo, ruta, respaldo, motivo}
//   crear              the file does not exist: it is written
//   replace-example it only has comments (the example the service copied): it is replaced, and the previous
//                      text is first saved in <ruta>.ejemplo, so nothing is lost
//   nuevo              it has active lines (it is the person's): it is NOT touched, the new text goes to <ruta>.nuevo
export function startupPlanWriting(path, textExisting, busy) {
	const ocup = Array.isArray(busy) ? busy : [];
	if (textExisting === null || textExisting === undefined) return { mode: 'create', path: path, backup: null, reason: 'startup.plan_create' };
	if (startupLinesActive(textExisting) === 0 && ocup.indexOf(path + '.example') < 0) {
		return { mode: 'replace-example', path: path, backup: path + '.example', reason: 'startup.plan_example' };
	}
	return { mode: 'newItem', path: nameFree(path, '.new', ocup), backup: null, reason: 'startup.plan_new' };
}

// What to tell after writing. textoLeido = the file read back (null = could not be read); fila = the row read
// again after the write (null = not read); plan = the plan that was followed.
// -> {ok, activas, mensajes: [{clave, params}]}: ok only when everything is as it should be. The messages are calm.
export function startupVerify(textRead, row, plan) {
	const m = [];
	if (textRead === null || textRead === undefined) {
		return { ok: false, active: 0, messages: [{ key: 'startup.verify_missing', params: { file: plan.path } }] };
	}
	const act = startupLinesActive(textRead);
	if (plan.mode === 'newItem') {
		m.push({ key: 'startup.verify_new', params: { file: plan.path } });
		return { ok: false, active: act, messages: m };
	}
	if (act === 0) m.push({ key: 'startup.verify_comments', params: { file: plan.path } });
	if (row && row.state !== 'configured') {
		if (act > 0) m.push({ key: 'startup.verify_notseen', params: { file: plan.path } });
	}
	if (!m.length) m.push({ key: 'startup.verify_ok', params: { file: plan.path } });
	return { ok: m.length === 1 && m[0].key === 'startup.verify_ok', active: act, messages: m };
}

// ---- the guide ("Guide me step by step", 2026-10-26) ----
// The guide is the walk above plus four things every plugin's rows can plug into without rewriting anything. A row (def) may carry:
//   missingText   key: the plain sentence of what is missing ("The macro that switches to laser mode has to be created.")
//   wizard        { questions, template } writes a file (preview, then save: never over a file of the person), or
//                 { questions, apply(values) } does something that is not a file (saves an answer): no preview, one button
//   manual        { steps: [keys], copy: 'text to paste', copyLabel: key }: what cannot be automated (hardware wiring, config.g, which this
//                 code never edits). The person does it, taps "Check" and the machine is read again
//   notUsing      any id (a mode): the "I do not use it" answer; the page that owns the setting is told (event) and the row goes away

// What is missing for THIS machine, in order, in plain words: only the rows that are shown, have data and apply (grey rows never).
// -> [{id, key (missingText or null), label, state}]
export function startupMissingList(rows) {
	return (rows || [])
		.filter(f => !f.hidden && !f.withoutData && (f.state === 'missing' || f.state === 'example'))
		.map(f => ({ id: f.id, key: f.def.missingText || null, label: f.def.label || null, title: f.def.title || null, state: f.state }));
}

// What a step does when it is applied: 'file' (writes a file), 'apply' (saves an answer), 'manual' (the person does it), 'none'.
export function startupStepKind(def) {
	if (def && def.wizard && typeof def.wizard.apply === 'function') return 'apply';
	if (def && def.wizard && typeof def.wizard.template === 'function') return 'file';
	if (def && def.manual) return 'manual';
	return 'none';
}

export function startupManual(def) {
	return def && def.manual && Array.isArray(def.manual.steps) ? def.manual : null;
}

// The id of the setting a row can be switched off with ("I do not use it"), or null.
export function startupNotUsing(def) {
	return def && def.notUsing ? def.notUsing : null;
}

// After a skip with a reason: the walk goes on with the rows that remain. Rows of a setting that was switched off are dropped
// from the walk (they are not applicable any more). `off` = ids that were switched off; rows without notUsing stay.
export function startupWalkWithout(est, rows, off) {
	const gone = {};
	(rows || []).forEach(f => {
		if (f.def && f.def.notUsing && (off || []).indexOf(f.def.notUsing) >= 0) gone[f.id] = true;
	});
	const n = { ids: est.ids.filter(id => !gone[id]), i: 0, end: false, done: est.done.slice(), skipped: est.skipped.slice() };
	const here = est.ids[est.i];
	const at = n.ids.indexOf(here);
	n.i = at >= 0 ? at : Math.min(est.i, Math.max(0, n.ids.length - 1));
	if (n.ids.length === 0 || (at < 0 && est.i >= n.ids.length)) n.end = true;
	return n;
}
