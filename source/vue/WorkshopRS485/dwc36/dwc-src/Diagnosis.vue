<template>
	<div>
		<div class="text-caption dim mb-3">
			{{ $t('plugins.WorkshopRS485.diagnosis.checks_each_bus_step_by_step') }}
		</div>

		<!-- ===== un bloque por bus ===== -->
		<v-sheet v-for="b in buses" :key="b.id" outlined rounded class="pa-3 mb-3">
			<div class="d-flex align-center flex-wrap" style="gap:8px">
				<v-icon :color="colorOf(liveSummary(b).code)">{{ b.kind === 'duet' ? 'mdi-expansion-card' : 'mdi-usb' }}</v-icon>
				<span class="text-subtitle-1 font-weight-medium">{{ b.name || b.id }}</span>
				<v-chip x-small outlined :color="colorOf(liveSummary(b).code)">{{ VERDICTS[liveSummary(b).code].short }}</v-chip>
				<v-spacer />
				<v-btn small outlined color="primary" :loading="busy === b.id" :disabled="!!busy || !can('rs485.diagnose')" @click="diagnose(b.id)">
					<v-icon small left>mdi-stethoscope</v-icon>{{ $t('plugins.WorkshopRS485.common.diagnose') }}
				</v-btn>
			</div>
			<div v-if="busy === b.id" class="text-caption mt-2">{{ $t('plugins.WorkshopRS485.diagnosis.checking_the_adapter_and_asking_each') }}</div>

			<template v-if="results[b.id]">
				<template v-for="r in [results[b.id]]">
					<v-alert :key="'v' + r.ts" dense text :type="VERDICTS[r.verdict].kind" class="mt-3 mb-2">
						<div class="font-weight-medium">{{ VERDICTS[r.verdict].title }}</div>
						<div class="text-body-2">{{ VERDICTS[r.verdict].perform }}</div>
						<div v-if="r.verdict === 'without_permission'" class="command mt-1"><code>sudo usermod -aG dialout dsf &amp;&amp; sudo systemctl restart duetpluginservice</code></div>
					</v-alert>

					<div :key="'p' + r.ts" class="steps">
						<!-- 1. adaptador -->
						<div v-if="r.kind !== 'duet'" class="step">
							<v-icon small :color="r.adapter.connected ? 'success' : 'error'">{{ r.adapter.connected ? 'mdi-check-circle' : 'mdi-close-circle' }}</v-icon>
							<div class="step-text">
								<div class="text-body-2">
									<span>{{ $t('plugins.WorkshopRS485.diagnosis.adapter') }}</span>
									<span v-if="r.adapter.connected">{{ $t('plugins.WorkshopRS485.common.connected') }}</span>
									<span v-else>{{ $t('plugins.WorkshopRS485.diagnosis.not_found') }}</span>
									<code class="ml-1">{{ r.port || '--' }}</code>
								</div>
								<div v-if="r.adapter.connected && (r.adapter.chip || r.adapter.vid || r.adapter.driver)" class="text-caption dim">
									<template v-if="r.adapter.chip">{{ r.adapter.chip }} &middot; </template>
									<template v-if="r.adapter.vid">VID:PID {{ r.adapter.vid }}:{{ r.adapter.pid }} &middot; </template>
									<template v-if="r.adapter.driver"><span>{{ $t('plugins.WorkshopRS485.common.driver') }}</span> {{ r.adapter.driver }}</template>
									<template v-if="r.adapter.producto"> &middot; {{ r.adapter.manufacturer }} {{ r.adapter.producto }}</template>
								</div>
								<div v-if="!r.adapter.connected && r.others_adapters.length" class="text-caption">
									<span>{{ $t('plugins.WorkshopRS485.diagnosis.another_adapter_is_connected') }}</span>
									<code v-for="o in r.others_adapters" :key="o.path" class="ml-1">{{ o.name }}</code>.
									<span>{{ $t('plugins.WorkshopRS485.diagnosis.if_it_is_the_same_one') }}</span>
								</div>
							</div>
						</div>
						<!-- 2. puerto -->
						<div class="step">
							<v-icon small :color="r.opens ? 'success' : 'error'">{{ r.opens ? 'mdi-check-circle' : 'mdi-close-circle' }}</v-icon>
							<div class="step-text">
								<div class="text-body-2">
									<template v-if="r.kind === 'duet'">
										<span v-if="r.opens">{{ $t('plugins.WorkshopRS485.diagnosis.the_duet_accepted_the_port_setup') }}</span>
										<span v-else>{{ $t('plugins.WorkshopRS485.diagnosis.the_duet_did_not_accept_the') }}</span>
									</template>
									<span v-else-if="r.opens">{{ $t('plugins.WorkshopRS485.diagnosis.the_port_opens') }}</span>
									<span v-else>{{ $t('plugins.WorkshopRS485.diagnosis.the_port_does_not_open') }}</span>
									<span class="dim"> &middot; {{ r.baud }} {{ r.format }}</span>
								</div>
								<div v-if="!r.opens && r.error" class="text-caption dim">{{ r.error }}</div>
							</div>
						</div>
						<!-- 3. trafico -->
						<div v-if="r.opens && r.kind !== 'duet'" class="step">
							<v-icon small :color="r.noise_bytes ? 'warning' : 'success'">{{ r.noise_bytes ? 'mdi-alert-circle' : 'mdi-check-circle' }}</v-icon>
							<div class="step-text">
								<div v-if="!r.noise_bytes" class="text-body-2">{{ $t('plugins.WorkshopRS485.diagnosis.cable_is_quiet_nobody_else_is') }}</div>
								<template v-else>
									<div class="text-body-2"><span>{{ $t('plugins.WorkshopRS485.diagnosis.data_arrives_without_asking') }}</span> {{ r.noise_bytes }} <span>{{ $t('plugins.WorkshopRS485.diagnosis.bytes_in_0_3_s') }}</span></div>
									<div class="text-caption dim">{{ $t('plugins.WorkshopRS485.diagnosis.it_may_be_another_program_or') }}</div>
								</template>
							</div>
						</div>
						<!-- 4. equipos -->
						<div v-if="r.opens" class="step">
							<v-icon small :color="colorMachines(r)">{{ colorMachines(r) === 'success' ? 'mdi-check-circle' : 'mdi-lan-disconnect' }}</v-icon>
							<div class="step-text">
								<div class="text-body-2">{{ $t('plugins.WorkshopRS485.diagnosis.configured_devices') }}</div>
								<div v-if="!r.devices.length" class="text-caption dim">{{ $t('plugins.WorkshopRS485.diagnosis.none_on_this_bus') }}</div>
								<div v-for="d in r.devices" :key="d.id" class="device">
									<span class="text-body-2"><b>{{ d.name }}</b> <span class="dim">&middot; {{ $t('plugins.WorkshopRS485.diagnosis.address_short', { n: d.address }) }}</span></span>
									<v-chip v-if="!d.active" x-small outlined color="grey">{{ $t('plugins.WorkshopRS485.diagnosis.disabled') }}</v-chip>
									<v-chip v-else-if="d.answers" x-small outlined color="success">{{ $t('plugins.WorkshopRS485.diagnosis.answers') }}</v-chip>
									<v-chip v-else-if="d.absent" x-small outlined color="grey">{{ $t('plugins.WorkshopRS485.diagnosis.absent_on_purpose') }}</v-chip>
									<v-chip v-else x-small outlined color="warning">{{ $t('plugins.WorkshopRS485.common.not_responding') }}</v-chip>
									<span v-if="!d.answers && d.active && !d.absent" class="text-caption dim">
										<template v-if="d.seen_does_s != null"><span>{{ ' ' }}{{ $t('plugins.WorkshopRS485.common.it_did_before') }}</span> {{ does(d.seen_does_s).n }} <span>{{ does(d.seen_does_s).u }}</span>)</template>
										<span v-else>{{ ' ' }}{{ $t('plugins.WorkshopRS485.common.never_answered') }}</span>
									</span>
									<span v-if="d.answers && d.absent" class="text-caption info--text">{{ $t('plugins.WorkshopRS485.diagnosis.it_answers_now_you_can_watch') }}</span>
									<v-spacer />
									<v-btn v-if="d.active && !d.absent && !d.answers" x-small text @click="$emit('absent', d.id, true)" :title="$t('plugins.WorkshopRS485.common.if_it_is_not_connected_on')">
										<v-icon x-small left>mdi-eye-off-outline</v-icon>{{ $t('plugins.WorkshopRS485.diagnosis.mark_absent') }}
									</v-btn>
									<v-btn v-if="d.absent" x-small text color="primary" @click="$emit('absent', d.id, false)">
										<v-icon x-small left>mdi-eye-outline</v-icon>{{ $t('plugins.WorkshopRS485.common.watch_again') }}
									</v-btn>
								</div>
							</div>
						</div>
						<div class="text-caption dim mt-1">
							<span>{{ $t('plugins.WorkshopRS485.diagnosis.since_the_service_started') }}</span> <span>{{ $t('plugins.WorkshopRS485.diagnosis.good_answers') }}</span> {{ r.stats.ok || 0 }} &middot; <span>{{ $t('plugins.WorkshopRS485.common.no_response') }}</span> {{ r.stats.without_response || 0 }} &middot; CRC {{ r.stats.crc || 0 }}
							<template v-if="r.response_does_s != null"> &middot; <span>{{ $t('plugins.WorkshopRS485.diagnosis.last_answer') }}</span> {{ does(r.response_does_s).n }} <span>{{ does(r.response_does_s).u }}</span></template>
						</div>
					</div>
				</template>
			</template>
		</v-sheet>
		<div v-if="!buses.length" class="text-body-2 dim mb-3">{{ $t('plugins.WorkshopRS485.diagnosis.no_buses_yet_create_one_in') }}</div>
		<div v-if="error" class="text-caption error--text mb-3">{{ error }}</div>

		<!-- ===== barrido ===== -->
		<v-sheet outlined rounded class="pa-3">
			<div class="d-flex align-center flex-wrap" style="gap:8px">
				<v-icon color="primary">mdi-radar</v-icon>
				<span class="text-subtitle-1 font-weight-medium">{{ $t('plugins.WorkshopRS485.diagnosis.search_all_addresses') }}</span>
			</div>
			<div class="text-caption dim mt-1 mb-2">
				{{ $t('plugins.WorkshopRS485.diagnosis.asks_address_by_address_whether_anyone') }}
			</div>
			<v-row dense>
				<v-col cols="12" sm="4">
					<v-select v-model="where" :items="optionsWhere" :label="$t('plugins.WorkshopRS485.diagnosis.where')" dense outlined hide-details :disabled="sweep.active" />
				</v-col>
				<v-col cols="6" sm="4">
					<v-select v-model="baud" :items="optionsBaud" :label="$t('plugins.WorkshopRS485.common.speed')" dense outlined hide-details :disabled="sweep.active || isDuet" />
				</v-col>
				<v-col cols="6" sm="4">
					<v-select v-model="parity" :items="optionsParity" :label="$t('plugins.WorkshopRS485.common.format')" dense outlined hide-details :disabled="sweep.active || isDuet" />
				</v-col>
				<v-col cols="4" sm="2"><v-text-field v-model.number="since" type="number" min="1" max="247" :label="$t('plugins.WorkshopRS485.common.from')" dense outlined hide-details :disabled="sweep.active" /></v-col>
				<v-col cols="4" sm="2"><v-text-field v-model.number="until" type="number" min="1" max="247" :label="$t('plugins.WorkshopRS485.common.to')" dense outlined hide-details :disabled="sweep.active" /></v-col>
				<v-col cols="4" sm="3"><v-text-field v-model.number="timeoutMs" type="number" min="30" max="2000" :label="$t('plugins.WorkshopRS485.diagnosis.wait_ms')" dense outlined hide-details :disabled="sweep.active" /></v-col>
				<v-col cols="12" sm="5" class="d-flex align-center" style="gap:8px">
					<v-btn v-if="!sweep.active" small color="primary" :disabled="!where || !!sending || !can('rs485.sweep')" :loading="sending" @click="start()">
						<v-icon small left>mdi-magnify-scan</v-icon>{{ $t('plugins.WorkshopRS485.diagnosis.find') }}
					</v-btn>
					<v-btn v-else small text @click="cancel()">{{ $t('plugins.WorkshopRS485.common.cancel') }}</v-btn>
					<span class="text-caption dim"><span>{{ $t('plugins.WorkshopRS485.diagnosis.takes_up_to') }}</span> {{ estimated }}</span>
				</v-col>
			</v-row>
			<div v-if="isDuet" class="text-caption dim mt-1">{{ $t('plugins.WorkshopRS485.diagnosis.on_the_duet_s_rs485_the') }}</div>

			<template v-if="sweep.total">
				<div class="text-caption mt-3">
					<template v-if="sweep.active"><span>{{ $t('plugins.WorkshopRS485.diagnosis.searching') }}</span> {{ textOf(sweep, 'text') }} &middot; </template>
					<template v-else-if="sweep.cancelled"><span>{{ $t('plugins.WorkshopRS485.diagnosis.cancelled') }}</span> &middot; </template>
					<template v-else><span>{{ $t('plugins.WorkshopRS485.diagnosis.finished') }}</span> &middot; </template>
					{{ $t('plugins.WorkshopRS485.diagnosis.n_of_total', { n: sweep.done, total: sweep.total }) }}
				</div>
				<v-progress-linear :value="sweep.total ? sweep.done / sweep.total * 100 : 0" height="4" rounded class="mt-1" />
				<div v-if="sweep.error" class="text-caption error--text mt-1">{{ textOf(sweep, 'error') }}</div>
				<div v-if="!sweep.active && !(sweep.found || []).length && !sweep.error" class="text-caption warning--text mt-2">
					{{ $t('plugins.WorkshopRS485.diagnosis.no_address_answered_check_that_the') }}
				</div>
				<div v-if="(sweep.found || []).length" class="d-flex align-center flex-wrap mt-2" style="gap:6px">
					<span class="text-caption">{{ $t('plugins.WorkshopRS485.common.answering') }}</span>
					<template v-for="e in sweep.found">
						<v-chip v-if="e.configured" :key="key(e)" x-small outlined color="success">{{ e.address }} &middot; {{ e.baud }} 8{{ e.parity }}1 &middot; {{ nameDisp(e.configured) }}</v-chip>
						<v-chip v-else-if="sweep.bus && sameFormat(e)" :key="key(e)" x-small color="primary" @click="$emit('add', sweep.bus, e.address)">
							<v-icon x-small left>mdi-plus</v-icon>{{ e.address }} &middot; {{ e.baud }} 8{{ e.parity }}1 &middot; <span>{{ $t('plugins.WorkshopRS485.diagnosis.add') }}</span>
						</v-chip>
						<v-chip v-else :key="key(e)" x-small outlined color="warning" :title="sweep.bus ? $t('plugins.WorkshopRS485.diagnosis.it_answers_with_a_different_format') : $t('plugins.WorkshopRS485.diagnosis.create_a_bus_with_this_adapter')">
							{{ e.address }} &middot; {{ e.baud }} 8{{ e.parity }}1
						</v-chip>
					</template>
				</div>
			</template>
		</v-sheet>
	</div>
</template>

<script>
import i18n from '../../i18n'

'use strict'

import { callService, BAUDS_T3D, does, textOf, canMixin } from './api.js'

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

const colors = { success: 'success', warning: 'warning', error: 'error', info: 'grey' };

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

export default {
	mixins: [canMixin],
	props: {
		cfg: Object,
		state: Object,
		ports: Object,
		sendCode: Function
	},
	data() {
		return {
			VERDICTS: verdicts,
			results: {},
			busy: null,
			error: null,
			sending: false,
			where: null,
			baud: 0,
			parity: '*',
			since: 1,
			until: 32,
			timeoutMs: 150
		};
	},
	computed: {
		buses() {
			return this.cfg.buses || [];
		},
		sweep() {
			return this.state.sweep || { active: false };
		},
		free() {
			const used = this.buses.filter(b => (b.kind || 'usb') === 'usb').map(b => b.port);
			return (this.ports.ports || []).filter(p => !used.includes(p.path) && !used.includes(p.real));
		},
		optionsWhere() {
			return [
				...this.buses.map(b => ({ text: b.name || b.id, value: 'bus:' + b.id })),
				...this.free.map(p => ({ text: p.name + (p.chip ? ' (' + p.chip + ')' : ''), value: 'port:' + p.path }))
			];
		},
		optionsBaud() {
			return [{ text: i18n.t('plugins.WorkshopRS485.diagnosis.all'), value: 0 }, ...BAUDS_T3D.map(b => ({ text: String(b), value: b }))];
		},
		optionsParity() {
			return [{ text: i18n.t('plugins.WorkshopRS485.common.all'), value: '*' }, { text: i18n.t('plugins.WorkshopRS485.common.8n1_none'), value: 'N' }, { text: i18n.t('plugins.WorkshopRS485.common.8e1_even'), value: 'E' }, { text: i18n.t('plugins.WorkshopRS485.common.8o1_odd'), value: 'O' }];
		},
		busChosen() {
			return this.where && this.where.startsWith('bus:') ? this.buses.find(b => 'bus:' + b.id === this.where) : null;
		},
		isDuet() {
			return !!this.busChosen && this.busChosen.kind === 'duet';
		},
		estimated() {
			const n = Math.max(0, (Number(this.until) || 0) - (Number(this.since) || 0) + 1);
			const combos = this.isDuet ? 1 : (this.baud ? 1 : BAUDS_T3D.length) * (this.parity === '*' ? 3 : 1);
			// without a response each address waits for the timeout (+ ~20 ms of the frame and the pause)
			const s = Math.round(n * combos * ((Number(this.timeoutMs) || 150) + 20) / 1000);
			const h = does(s);
			return h.n + ' ' + h.u;
		}
	},
	watch: {
		optionsWhere: {
			immediate: true,
			handler(l) {
				if (!l.some(o => o.value === this.where)) {
					this.where = l.length ? l[0].value : null;
				}
			}
		}
	},
	methods: {
		does: does,
		textOf: textOf,
		colorOf(code) {
			return colors[(verdicts[code] || verdicts.unknown).kind] || 'grey';
		},
		liveSummary(b) {
			const r = summaryLive(b, (this.state.buses || []).find(x => x.id === b.id), this.cfg.devices || [], this.state.devices || []);
			if (!verdicts[r.code]) {
				r.code = 'unknown';
			}
			return r;
		},
		colorMachines(r) {
			const vig = r.devices.filter(d => d.active && !d.absent);
			if (!vig.length || vig.every(d => d.answers)) {
				return 'success';
			}
			return 'warning';
		},
		async diagnose(busId) {
			this.busy = busId;
			this.error = null;
			try {
				const r = await callService(this.sendCode, { P: 'diagnose', B: busId });
				for (const d of r.diagnostics || []) {
					this.$set(this.results, d.bus, d);
				}
			} catch (e) {
				this.error = i18n.t('plugins.WorkshopRS485.diagnosis.could_not_diagnose') + (e.message || e);
			} finally {
				this.busy = null;
			}
		},
		async start() {
			this.sending = true;
			this.error = null;
			const p = { baud: this.baud, parity: this.parity, since: this.since, until: this.until, timeout_ms: this.timeoutMs };
			if (this.where.startsWith('bus:')) {
				p.bus = this.where.slice(4);
			} else {
				p.port = this.where.slice(7);
			}
			try {
				await callService(this.sendCode, { P: 'sweep', J: p });
			} catch (e) {
				this.error = i18n.t('plugins.WorkshopRS485.common.could_not_search') + (e.message || e);
			} finally {
				this.sending = false;
			}
		},
		async cancel() {
			try {
				await callService(this.sendCode, { P: 'sweep_cancel' });
			} catch (e) {
				this.error = i18n.t('plugins.WorkshopRS485.diagnosis.could_not_cancel') + (e.message || e);
			}
		},
		key(e) {
			return e.address + '-' + e.baud + e.parity;
		},
		sameFormat(e) {
			const b = this.buses.find(x => x.id === this.sweep.bus);
			return !!b && Number(b.baud) === Number(e.baud) && String(b.parity || 'N') === e.parity;
		},
		nameDisp(id) {
			const d = (this.cfg.devices || []).find(x => x.id === id);
			return d ? (d.name || d.id) : id;
		}
	}
};
</script>

<style scoped>
.dim {
	color: var(--tp-faint);
}
.steps .step {
	display: flex;
	align-items: flex-start;
	gap: 8px;
	padding: 4px 0;
}
.step-text {
	flex: 1;
	min-width: 0;
}
.device {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 6px;
	min-height: 32px;
}
.command code {
	font-size: 12px;
	white-space: pre-wrap;
	word-break: break-all;
}
</style>
