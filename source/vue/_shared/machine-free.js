'use strict';

// Is the machine free to move / to change settings? (2026-10-12, motion audit
// stage 2.0, findings 6 and 7). Same table as tallerMaquinaLibre in
// src/_shared/01-machine-free.js (JS pages); tests/machine-free.test.js checks that
// they say the same. It considers the file job (also paused), a live job's
// live job (plugins.WorkshopService.data.liveJob) and "busy".
//
//   maquinaLibre(model, op) -> { libre, codigo, motivo }
//     model   this.$store.state.machine.model (plugins as Map) or an equal object
//     op.purpose 'mover' (default) or 'settings' (mode, microstep, current: with the supply
//             off it is allowed)
//     op.allowBusy  true = 'busy' does not block
//     op.now current time in ms (only for tests)
//   codes: sinConexion, archivo, pausado, vivo, liveStill, detenida, ocupada
//   User decisions (2026-10-12): PAUSED file job: 'mover' is free
//   (code 'pausado' with a notice), 'settings' blocked. Live job: activity < 20 s or
//   busy machine = blocked; still for more than 20 s and 'mover' = { libre:false, confirmar:true,
//   codigo:'liveStill' }: the page asks for a second double tap
//   with the reason in view (only on the page: the service is not notified).

// 2026-10-13: also the view of the single owner of the movement of WorkshopService
// (data.motion): a reservation of another page or program (codigo 'reservada') and orders of
// the G-code bridge (codigo 'puente') block too, with the reason the service publishes.
// op.origin = who asks (its own reservation does not block it).

const ARCHIVO = ['processing', 'simulating', 'pausing', 'resuming', 'cancelling'];
const stopped = ['halted', 'off', 'disconnected', 'starting', 'updating', 'flashing'];

// plugin.data is a Map in DWC 3.7 (a plain object in 3.6 and in the test fixtures)
function dataField(p, field) {
	const d = p && p.data;
	if (!d) return undefined;
	return typeof d.get === 'function' ? d.get(field) : d[field];
}

export function jobInLive(model) {
	const pl = model && model.plugins;
	for (const id of ['WorkshopService']) {
		const p = pl && (typeof pl.get === 'function' ? pl.get(id) : pl[id]);
		const v = dataField(p, 'liveJob');
		if (v && v.active) return v;
	}
	return null;
}

const LIVE_STILL_MS = 20000;

function hourActivity(v) {
	if (typeof v === 'number') return v > 1e11 ? v : v * 1000;
	const t = v ? Date.parse(String(v)) : NaN;
	return isFinite(t) ? t : 0;
}

export function ownerMotion(model) {
	const pl = model && model.plugins;
	for (const id of ['WorkshopService']) {
		const p = pl && (typeof pl.get === 'function' ? pl.get(id) : pl[id]);
		if (dataField(p, 'motion')) return dataField(p, 'motion');
	}
	return null;
}

// English texts used when the caller gives no translator (op.t(key, params), the pages pass ts of shared-t.js)
const EN = {
	machine_free_no_connection: 'No connection with the machine',
	machine_free_job_running: 'A job is running{name}',
	machine_free_paused_settings: 'A job is paused{name}. Resume or cancel it before changing settings',
	machine_free_paused_notice: 'A job is paused{name}. When resumed the machine goes back to the position where it paused',
	machine_free_live_open: 'A live job is open{name}',
	machine_free_live_still: '{base}, quiet for {s} s. If the program keeps sending lines, they mix with this movement',
	machine_free_halted: 'The machine is not ready ({state})',
	machine_free_busy: 'The machine is busy with another order'
};

function plainText(key, params) {
	return EN[key].replace(/\{(\w+)\}/g, (m, k) => (params && params[k] !== undefined ? params[k] : ''));
}

// Texts of the service (data.motion reasons: {key, params}) through op.serviceText (service-text.js); the live job's
// default name through op.serviceDefaultKey. Without them (tests): a plain string as it is, a message by its key.
function plainService(v) {
	return typeof v === 'string' ? v : (v && v.key) || '';
}

export function machineFree(model, options) {
	const op = options || {};
	const tr = op.t || plainText;
	const svc = op.serviceText || plainService;
	const isDefaultName = n => (op.serviceDefaultKey ? !!op.serviceDefaultKey(n, ['live_job_default_name']) : !String(n || '').trim());
	const s = model && model.state && model.state.status;
	if (!s) return { free: false, code: 'sinConexion', reason: tr('machine_free_no_connection') };
	const arch = (model.job && model.job.file && model.job.file.fileName) || '';
	const nombre = arch ? String(arch).split('/').pop() : '';
	if (ARCHIVO.indexOf(s) !== -1 || (s === 'changingTool' && arch))
		return { free: false, code: 'file', reason: tr('machine_free_job_running', { name: nombre ? ': ' + nombre : '' }) };
	if (s === 'paused') {
		if (op.purpose === 'settings')
			return { free: false, code: 'paused', reason: tr('machine_free_paused_settings', { name: nombre ? ': ' + nombre : '' }) };
		return { free: true, code: 'paused', reason: '', notice: tr('machine_free_paused_notice', { name: nombre ? ': ' + nombre : '' }) };
	}
	const dueno = ownerMotion(model);
	if (dueno && dueno.owner && dueno.owner.origin && dueno.owner.origin !== op.origin)
		return { free: false, code: 'reserved', reason: svc(dueno.owner.reason) || dueno.owner.origin };
	// Movement lock settings of the service (Services page): 'duet' = like Duet / DWC, a live job and the bridge do not block
	// MOVING (settings stay protected); release_s = quiet seconds that free the movement (default 20).
	const aj = (dueno && dueno.settings) || {};
	const asDuet = aj.mode === 'duet' && op.purpose !== 'settings';
	const stillMs = typeof aj.release_s === 'number' && aj.release_s > 0 ? aj.release_s * 1000 : LIVE_STILL_MS;
	if (dueno && dueno.state === 'bridge_active' && op.purpose !== 'settings' && !asDuet)
		return { free: false, code: 'bridge', reason: svc(dueno.reason) };
	const live = asDuet ? null : jobInLive(model);
	if (live) {
		const nv = tr('machine_free_live_open', { name: live.name && !isDefaultName(live.name) ? ': ' + live.name : '' });
		const ahora = op.now || Date.now();
		const last = hourActivity(live.lastActivity);
		const still = last > 0 && ahora - last > stillMs && s !== 'busy';
		if (op.purpose !== 'settings' && still)
			return { free: false, confirm: true, code: 'liveStill', reason: tr('machine_free_live_still', { base: nv, s: Math.round((ahora - last) / 1000) }) };
		return { free: false, code: 'live', reason: nv };
	}
	if (stopped.indexOf(s) !== -1 && !(s === 'off' && op.purpose === 'settings'))
		return { free: false, code: 'halted', reason: tr('machine_free_halted', { state: s }) };
	if (s !== 'idle' && s !== 'off' && !(s === 'busy' && (op.allowBusy || asDuet)))
		return { free: false, code: 'busy', reason: tr('machine_free_busy') };
	return { free: true, code: '', reason: '' };
}
