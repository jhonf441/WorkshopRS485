import i18n from '../../i18n'
'use strict'

// Calls to the backend WorkshopRS485 (dsf/main.py) through its API
// (POST /machine/WorkshopRS485/api).
// The pages keep describing a call with the old letters ({ P: 'accion', I, A, J });
// llamarServicio() turns them into the operation rs485.<name> with named arguments.

import { api } from './workshop-api.js'

export { canMixin } from './roles-mixin.js' // can(op, args): what the role may do (the backend decides)

// letter of the old command -> named argument of the API operation
const ARGS = { I: 'device', A: 'action', J: 'data', B: 'bus', U: 'port', C: 'key', N: 'name', D: 'from', H: 'to', R: 'register', F: 'function' };

// sendCode: not used any more (kept so the callers do not change)
export async function callService(sendCode, params) {
	params = Object.assign({}, params);
	const op = 'rs485.' + (params.P || 'status');
	const args = {};
	for (const [k, v] of Object.entries(params)) {
		if (k === 'P' || v === undefined || v === null || !ARGS[k]) {
			continue;
		}
		args[ARGS[k]] = v;
	}
	try {
		return await api(op, args, { plugin: 'rs485' });
	} catch (e) {
		throw new Error(String((e && e.message) || e).replace(/^RS485:\s*/, ''));
	}
}

export function action(sendCode, dispId, nombre, data) {
	return callService(sendCode, { P: 'action', I: dispId, A: nombre, J: data || {} });
}

export const states = {
	ok: { text: i18n.t('plugins.WorkshopRS485.api.ok'), color: 'green' },
	alarm: { text: i18n.t('plugins.WorkshopRS485.api.fault'), color: 'red' },
	without_communication: { text: i18n.t('plugins.WorkshopRS485.api.no_communication'), color: 'orange' },
	shutdown: { text: i18n.t('plugins.WorkshopRS485.api.disabled'), color: 'grey' },
	absent: { text: i18n.t('plugins.WorkshopRS485.api.absent'), color: 'grey' },
	unknown: { text: i18n.t('plugins.WorkshopRS485.api.connecting'), color: 'grey' }
};

// Values that go in the T3D servo panel: P-182 = speed index,
// P-183 = format (8N1=0, 8E1=1, 8O1=2; only 1 stop bit).
export const BAUDS_T3D = [4800, 9600, 19200, 38400, 57600, 115200];
export const PARITY_T3D = { N: 0, E: 1, O: 2 };

// Options of a device: those of the default profile + those it already has.
export function optionsOf(profiles, profileId, current) {
	const p = profiles.find(x => x.id === profileId);
	const o = Object.assign(JSON.parse(JSON.stringify((p && p.options) || {})), current || {});
	if (profileId === 'generic' && !Array.isArray(o.records)) {
		o.records = [];
	}
	if (o.in_live == null) {
		o.in_live = 'notify';
	}
	if (o.in_motion == null) {
		o.in_motion = 'notify';
	}
	return o;
}

// Fixed profile data (parameter table, alarms, states): a single
// read per device while the page is open.
const INFO = {};

export function info(sendCode, dispId) {
	if (!INFO[dispId]) {
		INFO[dispId] = callService(sendCode, { P: 'info', I: dispId }).catch(e => {
			delete INFO[dispId];
			throw e;
		});
	}
	return INFO[dispId];
}

export function hex(n, digits = 4) {
	return '0x' + n.toString(16).toUpperCase().padStart(digits, '0');
}

// How each T3D alarm is cleared ('borrado' field of profiles/t3d_alarmas.py)
export const deleted = {
	si: { text: i18n.t('plugins.WorkshopRS485.api.can_be_cleared'), color: 'green darken-1', help: i18n.t('plugins.WorkshopRS485.api.from_here_once_the_cause_is') },
	procedure: { text: i18n.t('plugins.WorkshopRS485.api.procedure'), color: 'orange darken-2', help: i18n.t('plugins.WorkshopRS485.api.special_steps_on_the_servo_panel') },
	no: { text: i18n.t('plugins.WorkshopRS485.api.restart_servo'), color: 'red darken-1', help: i18n.t('plugins.WorkshopRS485.api.remove_the_cause_and_power_cycle') }
};

// A text of the published state (plugin data "rs485"): dsf/message_data.py writes each message in Spanish
// ("field") and in English ("field_en"); this shows the one of DWC's language. What comes through the API
// (rs485.*) is already in the language of the request.
export function textOf(o, field) {
	if (!o) {
		return '';
	}
	const en = o[field + '_en'];
	return String(i18n.locale || '').startsWith('en') && en != null ? en : o[field];
}

// "does X" from seconds (the backend sends seconds, not the time:
// DSF rounds the epochs and the Pi's clock may be shifted)
export function does(s) {
	if (s == null) {
		return { n: '', u: '' };
	}
	if (s < 90) {
		return { n: s, u: 's' };
	}
	if (s < 5400) {
		return { n: Math.round(s / 60), u: 'min' };
	}
	if (s < 172800) {
		return { n: Math.round(s / 3600), u: 'h' };
	}
	return { n: Math.round(s / 86400), u: i18n.t('plugins.WorkshopRS485.api.days_unit') };
}
