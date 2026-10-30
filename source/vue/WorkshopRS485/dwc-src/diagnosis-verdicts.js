'use strict'

// Verdicts of the bus diagnosis (texts and kind) and the live summary of a bus. Used by Diagnosis.vue and RS485.vue.

import { i18n } from './dwc-host.js'

// What each verdict says (dsf/diagnostico.py) and what to do. Fixed texts
// so the translator finds them.
export const verdicts = {
	all_ok: { short: i18n.t('plugins.WorkshopRS485.diagnosis.all_good'), kind: 'success', title: i18n.t('plugins.WorkshopRS485.diagnosis.all_good_the_adapter_works_and'), perform: i18n.t('plugins.WorkshopRS485.diagnosis.nothing_to_do') },
	some_no_answer: { short: i18n.t('plugins.WorkshopRS485.diagnosis.one_is_not_answering'), kind: 'warning', title: i18n.t('plugins.WorkshopRS485.diagnosis.the_adapter_works_but_some_device'), perform: i18n.t('plugins.WorkshopRS485.diagnosis.check_that_it_is_on_its') },
	nobody_answers: { short: i18n.t('plugins.WorkshopRS485.diagnosis.no_device_answers'), kind: 'warning', title: i18n.t('plugins.WorkshopRS485.diagnosis.adapter_connected_but_no_device_answers'), perform: i18n.t('plugins.WorkshopRS485.diagnosis.if_nothing_is_connected_to_the') },
	all_absent: { short: i18n.t('plugins.WorkshopRS485.diagnosis.absent_devices'), kind: 'info', title: i18n.t('plugins.WorkshopRS485.diagnosis.adapter_connected_every_device_on_this'), perform: i18n.t('plugins.WorkshopRS485.diagnosis.they_are_not_watched_and_do') },
	without_devices: { short: i18n.t('plugins.WorkshopRS485.diagnosis.no_devices'), kind: 'info', title: i18n.t('plugins.WorkshopRS485.diagnosis.adapter_connected_there_are_no_devices'), perform: i18n.t('plugins.WorkshopRS485.diagnosis.search_all_addresses_below_or_add') },
	adapter_no_found: { short: i18n.t('plugins.WorkshopRS485.common.adapter_not_found'), kind: 'error', title: i18n.t('plugins.WorkshopRS485.diagnosis.adapter_not_found_the_system_does'), perform: i18n.t('plugins.WorkshopRS485.diagnosis.plug_it_into_a_usb_port') },
	without_permission: { short: i18n.t('plugins.WorkshopRS485.diagnosis.no_permission'), kind: 'error', title: i18n.t('plugins.WorkshopRS485.diagnosis.the_adapter_is_there_but_the'), perform: i18n.t('plugins.WorkshopRS485.diagnosis.once_on_the_system_ssh') },
	busy: { short: i18n.t('plugins.WorkshopRS485.diagnosis.busy'), kind: 'error', title: i18n.t('plugins.WorkshopRS485.diagnosis.the_adapter_is_there_but_another'), perform: i18n.t('plugins.WorkshopRS485.diagnosis.close_the_other_program_or_remove') },
	no_opens: { short: i18n.t('plugins.WorkshopRS485.diagnosis.does_not_open'), kind: 'error', title: i18n.t('plugins.WorkshopRS485.diagnosis.the_port_does_not_open_2'), perform: i18n.t('plugins.WorkshopRS485.diagnosis.unplug_the_adapter_and_plug_it') },
	without_port: { short: i18n.t('plugins.WorkshopRS485.diagnosis.no_adapter_chosen'), kind: 'warning', title: i18n.t('plugins.WorkshopRS485.diagnosis.this_bus_has_no_adapter_chosen'), perform: i18n.t('plugins.WorkshopRS485.diagnosis.pick_the_adapter_in_buses_and') },
	without_pyserial: { short: i18n.t('plugins.WorkshopRS485.diagnosis.pyserial_missing'), kind: 'error', title: i18n.t('plugins.WorkshopRS485.diagnosis.pyserial_is_missing_in_the_plugin'), perform: i18n.t('plugins.WorkshopRS485.diagnosis.reinstall_the_plugin_from_plugins') },
	unknown: { short: i18n.t('plugins.WorkshopRS485.diagnosis.not_checked'), kind: 'info', title: '', perform: '' },
	connecting: { short: i18n.t('plugins.WorkshopRS485.diagnosis.not_used_yet'), kind: 'info', title: '', perform: '' }
};

// Bus state without sending anything (with what the plugin publishes every 0.5 s):
// the same idea as the diagnosis, for the page's notice.
export function summaryLive(busCfg, busLive, disps, live) {
	if (!busLive) {
		return { code: 'unknown', silent: [] };
	}
	const errors = { no_found: 'adapter_no_found', permission: 'without_permission', busy: 'busy', without_port: 'without_port', without_pyserial: 'without_pyserial' };
	if (!busLive.open && errors[busLive.error_kind]) {
		return { code: errors[busLive.error_kind], silent: [] };
	}
	const own = disps.filter(d => d.bus === busCfg.id && d.active !== false);
	if (!own.length) {
		return { code: busLive.open ? 'without_devices' : 'connecting', silent: [] };
	}
	const vigilados = own.filter(d => !d.absent);
	if (!vigilados.length) {
		return { code: 'all_absent', silent: [] };
	}
	const v = id => live.find(x => x.id === id) || {};
	const mudos = vigilados.filter(d => v(d.id).state === 'without_communication').map(d => ({ ...d, seen_does_s: v(d.id).seen_does_s }));
	if (!busLive.open && !mudos.length) {
		return { code: busLive.error ? 'no_opens' : 'connecting', silent: mudos };
	}
	if (mudos.length === vigilados.length) {
		return { code: 'nobody_answers', silent: mudos };
	}
	return { code: mudos.length ? 'some_no_answer' : 'all_ok', silent: mudos };
}
