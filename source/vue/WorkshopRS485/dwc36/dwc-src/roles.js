'use strict'

// Which role each RS485 operation needs. A MIRROR of OP_ROLES / ACTION_ROLES of dsf/rs485_access.py (the backend is the authority and
// answers 403 / 401 on its own; this table only decides which buttons are worth showing). tests/rs485-roles.test.js compares both.
// Pure logic, no imports, so it is tested with node.

export const OP_ROLES = {
	'rs485.status': 'viewer',
	'rs485.history': 'viewer',
	'rs485.info': 'viewer',
	'rs485.profile_example': 'viewer',
	'rs485.config': 'operator',
	'rs485.ports': 'operator',
	'rs485.backups': 'operator',
	'rs485.backup_read': 'operator',
	'rs485.profile_check': 'operator',
	'rs485.diagnose': 'technician',
	'rs485.scan': 'technician',
	'rs485.sweep': 'technician',
	'rs485.detect': 'technician',
	'rs485.add_detected': 'technician',
	'rs485.ignore_detected': 'technician',
	'rs485.save': 'technician',
	'rs485.backup_save': 'technician',
	'rs485.backup_delete': 'technician',
	'rs485.action': 'operator',
	'rs485.clear_history': 'admin',
	'rs485.sweep_cancel': null
};

export const ACTION_ROLES = {
	read_param: 'operator', read_params: 'operator', read_states: 'operator', read_register: 'operator',
	read_parameters: 'operator', export_profile: 'operator', explore_status: 'operator',
	identify: 'technician', explore: 'technician',
	explore_cancel: null,
	write_param: 'technician', write_parameter: 'technician', clear_alarm: 'technician', save_eeprom: 'technician',
	write_register: 'admin'
};

// Role needed by a call ('viewer' ... 'admin') or null when any caller may make it. An unknown operation / action needs admin.
export function neededRole(op, args) {
	let need = Object.prototype.hasOwnProperty.call(OP_ROLES, op) ? OP_ROLES[op] : 'admin';
	if (op !== 'rs485.action') return need;
	const a = args || {};
	need = Object.prototype.hasOwnProperty.call(ACTION_ROLES, a.action) ? ACTION_ROLES[a.action] : 'admin';
	if (need !== null && a.data && typeof a.data === 'object' && a.data.force) need = 'admin';
	return need;
}

// The calls of each card of the page: the card shows ONE reason (<lock-reason :min="reasonRole('device')">) for the group, not one per button.
export const CALLS = {
	device: [['rs485.save'], ['rs485.action', { action: 'write_register' }], ['rs485.action', { action: 'identify' }], ['rs485.action', { action: 'explore' }]],
	editor: [['rs485.save']],
	diagnose: [['rs485.diagnose']],
	sweep: [['rs485.sweep']],
	history: [['rs485.clear_history']],
	profile: [['rs485.action', { action: 'write_parameter' }]],
	backups: [['rs485.backup_save'], ['rs485.backup_delete']],
	params: [['rs485.action', { action: 'write_param' }], ['rs485.action', { action: 'save_eeprom' }]],
	list: [['rs485.save']],
	detect: [['rs485.detect'], ['rs485.add_detected'], ['rs485.ignore_detected']],
	scan: [['rs485.scan']],
	buses: [['rs485.save']]
};

const ORDER = ['viewer', 'operator', 'technician', 'admin'];

// The lowest role that would unlock something of the group the person cannot do now ('' when they can do all): the card names it.
export function lowestMissing(group, atLeast) {
	let best = '';
	for (const [op, args] of CALLS[group] || []) {
		const need = neededRole(op, args);
		if (need === null || atLeast(need)) continue;
		if (!best || ORDER.indexOf(need) < ORDER.indexOf(best)) best = need;
	}
	return best;
}
