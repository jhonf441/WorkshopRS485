'use strict';

// Rows of the start-up card of RS485 (vue/_shared/StartupPanel.vue), made from the steps of the guide (guide-steps.js):
// the card and the "How it works" tab never disagree. Pure function (no imports): tests/startup-plugins.test.js
// loads it in node.
//
// RS485 has its own backend (the WorkshopRS485 plugin service), not WorkshopService: the "service" row of this card is
// that one (the shared card is used with filaServicio false). The adapter is hardware of the person:
// with the Duet's own RS485 port the permission step is grey, and a step blocked by a previous one is orange
// ("waiting"), never red.
//
// c = { backendVivo: bool, pasos: [step of pasosGuia()], t(key) }
const state = { ok: 'configured', fault: 'missing', pending: 'example', na: 'na' };

export function rowsRS485(c) {
	const steps = (c && c.steps) || [];
	const out = [
		{ id: 'service', state: c && c.backendLive ? 'configured' : 'missing', label: 'row_service', what: 'row_service_what', why: 'row_service_for', ifMissing: 'row_service_missing', help: 'row_service_tip', texts: { configured: 'service_ok', missing: 'service_down' } }
	];
	steps.forEach(p => {
		if (p.id === 'service') return; // the row above says it
		const def = {
			id: p.id,
			state: state[p.state] || 'na',
			title: p.title, // already translated by the guide
			text: p.detail
		};
		if (p.button) {
			def.action = p.button.action;
			def.actionText = p.button.text;
		}
		out.push(def);
	});
	return out;
}
