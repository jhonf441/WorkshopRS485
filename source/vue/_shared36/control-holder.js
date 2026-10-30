'use strict';

// Who has the control of the movement (F1-D of the redesign, 2026-10-21). The service keeps ONE owner of the movement
// (motion_owner.py) and publishes it in plugins.WorkshopService.data.motion: owner {origin, name, device (8 characters),
// since (epoch s), reason} and notice {kind: 'taken_over', from_user, from_device, by, at} for the previous owner after a take
// over. Same logic for the JS plugins in src/_shared/07-control-holder.js: keep them equal.
//
//   controlOf(model, device)       { held, mine, name, device, since, origin, reason } (held false = nobody has it)
//   controlText(c, t)              'Beto has the control since 14:32' | 'You have the control' | ''
//   canTakeControl()               this person may take the control (technician or administrator)
//   takeControl()                  motion.take_over
//   controlNotice(model, device, seen)   the take over notice addressed to THIS browser that was not shown yet, or null
//
// model is this.$store.state.machine.model (plugins as Map) or an equal object. The control is 'mine' when the published short
// device is the beginning of the id of this browser. An owner without a device (an internal reservation of the service) is
// nobody's: it is shown as held, never as mine.

import { ownerMotion } from './machine-free.js';
import { serviceText } from './service-text.js';
import { deviceId } from './workshop-auth.js';
import { api, workshopCan } from './workshop-api.js';
import { ts } from './shared-t.js';

export const TAKE_SECONDS = 4;

function isMine(owner, device) {
	const d = String((owner && owner.device) || '');
	const mine = String(device === undefined ? deviceId() : device || '');
	return !!d && !!mine && mine.indexOf(d) === 0;
}

export function controlOf(model, device) {
	const m = ownerMotion(model);
	const o = m && m.owner;
	if (!o || !o.origin) return { held: false, mine: false, name: '', device: '', since: 0, origin: '', reason: '' };
	return {
		held: true,
		mine: isMine(o, device),
		name: String(o.name || ''),
		device: String(o.device || ''),
		since: Number(o.since) || 0,
		origin: String(o.origin),
		reason: serviceText(o.reason),
	};
}

export function controlWho(c) {
	return c && c.name ? c.name : ts('control_other_device');
}

function clock(epoch) {
	const d = new Date(epoch * 1000);
	return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

export function controlText(c) {
	if (!c || !c.held) return '';
	if (c.mine) return ts('control_you_have_it');
	if (!c.name && !c.device) return c.reason;
	return c.since ? ts('control_held_by_since', { who: controlWho(c), since: clock(c.since) }) : ts('control_held_by', { who: controlWho(c) });
}

export function canTakeControl() {
	return workshopCan('motion.take_over');
}

export function takeControl() {
	return api('motion.take_over', { origin: 'jog', action: 'move', text: '', seconds: TAKE_SECONDS });
}

// seen = { at: n } remembered by the caller, so each notice is shown once.
export function controlNotice(model, device, seen) {
	const m = ownerMotion(model);
	const n = m && m.notice;
	if (!n || n.kind !== 'taken_over' || !n.at) return null;
	if (seen && seen.at >= n.at) return null;
	const mine = String(device === undefined ? deviceId() : device || '');
	if (!n.from_device || !mine || mine.indexOf(n.from_device) !== 0) return null;
	if (seen) seen.at = n.at;
	if (Date.now() / 1000 - n.at > 60) return null;
	const who = n.by ? n.by : ts('control_other_device');
	return { by: who, text: ts('control_taken_from_you', { who }) };
}
