'use strict';

// Steps of the RS485 start-up guide (StartupGuide.vue, "How it works" tab) and, from the same steps, the rows of the
// start-up card on the Devices tab (startup-rows.js): ONE place decides what is done, so the card and the guide never
// disagree. Pure function (no imports): tests/startup-plugins.test.js loads it in node.
//
// Every step is evaluated with what the plugin publishes (config, ports, live state):
//   estado: ok | falla | pendiente (blocked by a previous step, or still waiting) | na (does not apply to this setup)
// A button is { texto, accion: ['actualizar'] | ['ir', tab] | ['agregar'] }; the component turns it into an event.
//
// c = { cfg, estado, puertos, backendVivo,
//       t(key, params),            text in the DWC language (plugins.WorkshopRS485.guiaPuesta.*)
//       rutaExiste(path),          true when DWC has a page at that route (Lights / Activity are optional plugins)
//       ESTADOS }                  texts and colours of the state of a device (api.js)
const LIVE_S = 15; // one good reading in the last 15 s (system clock) = watching

export function stepsGuide(c) {
	const t = c.t;
	const steps = [];
	const buses = c.cfg.buses || [];
	const usb = buses.filter(b => (b.kind || 'usb') === 'usb');
	const lista = c.ports.ports || [];
	const disps = c.cfg.devices || [];
	// the ones absent on purpose are not expected
	const active = disps.filter(d => d.active !== false && !d.absent);
	const live = c.state.devices || [];
	const vivo = id => live.find(v => v.id === id) || {};
	let blocked = !c.backendLive;
	const mark = (step, ok, faultSiNo = true) => {
		step.state = blocked ? 'pending' : (ok ? 'ok' : (faultSiNo ? 'fault' : 'pending'));
		if (!ok) {
			blocked = true;
		}
		steps.push(step);
	};

	// 0. the service of the plugin
	if (!c.backendLive) {
		steps.push({
			id: 'service', state: 'fault', title: t('plugins.WorkshopRS485.startupGuide.plugin_service'),
			detail: t('plugins.WorkshopRS485.startupGuide.not_responding_check_in_plugins_that')
		});
	}

	// 1. adapter
	const onlyDuet = buses.length > 0 && !usb.length;
	const p1 = { id: 'adapter', title: t('plugins.WorkshopRS485.startupGuide.adapter_connected') };
	if (onlyDuet) {
		p1.detail = t('plugins.WorkshopRS485.startupGuide.you_use_the_duet_s_rs485');
		mark(p1, true);
	} else {
		p1.detail = lista.length
			? (lista.length === 1 ? t('plugins.WorkshopRS485.startupGuide.system_sees_one_adapter', { list: lista.map(p => p.name).join(', ') }) : t('plugins.WorkshopRS485.startupGuide.system_sees_n_adapters', { n: lista.length, list: lista.map(p => p.name).join(', ') }))
			: t('plugins.WorkshopRS485.startupGuide.the_system_does_not_see_any');
		p1.button = { text: t('plugins.WorkshopRS485.common.refresh'), action: ['update'] };
		mark(p1, lista.length > 0);
	}

	// 2. permission
	const p2 = { id: 'permission', title: t('plugins.WorkshopRS485.startupGuide.permission_to_use_the_serial_port') };
	if (onlyDuet) {
		p2.detail = t('plugins.WorkshopRS485.startupGuide.not_needed_with_the_duet_s');
		p2.state = 'na';
		steps.push(p2);
	} else if (c.ports.group_dialout === null || c.ports.group_dialout === undefined) {
		p2.detail = t('plugins.WorkshopRS485.startupGuide.could_not_check_if_the_bus');
		p2.state = blocked ? 'pending' : 'na';
		steps.push(p2);
	} else {
		p2.detail = c.ports.group_dialout
			? t('plugins.WorkshopRS485.startupGuide.the_service_is_in_the_dialout')
			: t('plugins.WorkshopRS485.startupGuide.the_service_is_missing_the_dialout');
		p2.command = 'sudo usermod -aG dialout dsf && sudo systemctl restart duetpluginservice';
		mark(p2, !!c.ports.group_dialout);
	}

	// 3. bus open
	const busesLive = c.state.buses || [];
	const p3 = { id: 'bus', title: t('plugins.WorkshopRS485.startupGuide.bus_configured_and_open') };
	if (!buses.length) {
		p3.detail = t('plugins.WorkshopRS485.startupGuide.there_is_no_bus_yet_create');
		p3.button = { text: t('plugins.WorkshopRS485.startupGuide.go_to_buses'), action: ['go', 1] };
		mark(p3, false, true);
	} else {
		const abiertos = busesLive.filter(b => b.open);
		p3.items = busesLive.map(b => ({ text: b.name + ': ' + (b.open ? t('plugins.WorkshopRS485.startupGuide.open_m') : (b.error || t('plugins.WorkshopRS485.startupGuide.closed_m'))), color: b.open ? 'success' : 'warning' }));
		const inUse = buses.filter(b => disps.some(d => d.bus === b.id));
		const necesarios = inUse.length ? inUse : buses;
		const ok = necesarios.every(b => (busesLive.find(v => v.id === b.id) || {}).open);
		p3.detail = ok
			? (buses.length === 1 ? t('plugins.WorkshopRS485.startupGuide.n_of_1_bus_open', { n: abiertos.length }) : t('plugins.WorkshopRS485.startupGuide.n_of_total_buses_open', { n: abiertos.length, total: buses.length }))
			: t('plugins.WorkshopRS485.startupGuide.a_bus_does_not_open_check');
		p3.button = { text: t('plugins.WorkshopRS485.startupGuide.go_to_buses'), action: ['go', 1] };
		mark(p3, ok);
	}

	// 4. the device answers
	const p4 = { id: 'answers', title: t('plugins.WorkshopRS485.startupGuide.the_device_answers') };
	if (!active.length) {
		p4.detail = disps.length ? t('plugins.WorkshopRS485.startupGuide.all_devices_are_disabled') : t('plugins.WorkshopRS485.startupGuide.add_your_device_for_example_the');
		p4.button = { text: t('plugins.WorkshopRS485.common.add_device'), action: ['add'] };
		mark(p4, false);
	} else {
		const withCom = active.filter(d => ['ok', 'alarm'].includes(vivo(d.id).state));
		p4.items = active.map(d => {
			const e = c.STATES[vivo(d.id).state] || c.STATES.unknown;
			return { text: t('plugins.WorkshopRS485.startupGuide.device_addr_state', { name: d.name || d.id, n: d.address, state: e.text }), color: e.color };
		});
		p4.detail = withCom.length === active.length
			? t('plugins.WorkshopRS485.startupGuide.all_answer')
			: t('plugins.WorkshopRS485.startupGuide.one_does_not_answer_check_address');
		mark(p4, withCom.length === active.length);
	}

	// 5. monitoring
	const p5 = { id: 'monitoring', title: t('plugins.WorkshopRS485.startupGuide.monitoring_working') };
	const now = c.state.ts || 0;
	const reading = active.filter(d => vivo(d.id).last_ok && now - vivo(d.id).last_ok < LIVE_S);
	const inAlarm = active.filter(d => vivo(d.id).state === 'alarm');
	p5.items = active.map(d => {
		const o = d.options || {};
		const that = { pause: t('plugins.WorkshopRS485.common.pauses_and_warns'), notify: t('plugins.WorkshopRS485.common.only_warns'), nothing: t('plugins.WorkshopRS485.startupGuide.only_shows') }[o.action_fault] || t('plugins.WorkshopRS485.common.pauses_and_warns');
		return { text: (d.name || d.id) + ': ' + (d.axis ? t('plugins.WorkshopRS485.startupGuide.axis_name', { axis: d.axis }) : t('plugins.WorkshopRS485.common.no_axis')) + ', ' + that, color: d.axis ? 'primary' : 'grey' };
	});
	if (active.length && reading.length === active.length && inAlarm.length) {
		p5.detail = t('plugins.WorkshopRS485.startupGuide.read_but_in_fault', { list: inAlarm.map(d => d.name || d.id).join(', ') });
		p5.button = { text: t('plugins.WorkshopRS485.startupGuide.see_devices'), action: ['go', 0] };
		mark(p5, false);
	} else {
		p5.detail = active.length && reading.length === active.length
			? t('plugins.WorkshopRS485.startupGuide.it_is_read_every_few_seconds' + (c.pathExists('/Plugins/Lights') ? '' : '_no_lights') + (c.pathExists('/Plugins/Activity') ? '' : '_no_activity'))
			: t('plugins.WorkshopRS485.startupGuide.waiting_good_readings');
		mark(p5, active.length > 0 && reading.length === active.length, false);
	}
	return steps;
}
