<template>
	<!-- JSON equipment profile (2026-10-10): parameter and alarm tables of
		     a generic Modbus device, filled from a file (Edit >
		     Equipment profile). Format: dsf/profiles/perfil_json.py -->
	<div class="pe">
		<div v-if="deviceText" class="text-body-2 mb-2">
			<v-icon small class="mr-1">mdi-card-account-details-outline</v-icon>{{ deviceText }}
			<span v-if="pe.device && pe.device.notes" class="grey--text"> &middot; {{ pe.device.notes }}</span>
		</div>

		<v-tabs v-model="tab" height="34" class="mb-2">
			<v-tab><v-icon small left>mdi-tune</v-icon>{{ $t('plugins.WorkshopRS485.machineProfile.parameters_n', { n: params.length }) }}</v-tab>
			<v-tab><v-icon small left :color="alarmCurrent ? 'error' : ''">mdi-alert-circle-outline</v-icon>{{ $t('plugins.WorkshopRS485.machineProfile.alarms_n', { n: alarms.length }) }}</v-tab>
		</v-tabs>

		<!-- ===== parametros ===== -->
		<template v-if="tab === 0">
			<div class="pe-bar">
				<v-btn small outlined :loading="reading" :disabled="!params.length" @click="readAll()"><v-icon small left>mdi-download</v-icon>{{ $t('plugins.WorkshopRS485.machineProfile.read_all') }}</v-btn>
				<v-text-field v-model="filter" prepend-inner-icon="mdi-magnify" :placeholder="$t('plugins.WorkshopRS485.machineProfile.name_register_or_word')" dense outlined hide-details clearable class="pe-search" />
				<span v-if="msg" class="text-caption" :class="msgError ? 'error--text' : 'success--text'">{{ msg }}</span>
			</div>
			<div v-if="!params.length" class="text-body-2 grey--text pa-3">{{ $t('plugins.WorkshopRS485.machineProfile.the_profile_has_no_parameters') }}</div>
			<v-simple-table v-else dense class="pe-table">
				<thead>
					<tr><th>{{ $t('plugins.WorkshopRS485.common.register') }}</th><th>{{ $t('plugins.WorkshopRS485.common.name') }}</th><th>{{ $t('plugins.WorkshopRS485.common.value') }}</th><th>{{ $t('plugins.WorkshopRS485.machineProfile.range') }}</th><th /></tr>
				</thead>
				<tbody>
					<template v-for="r in visible">
						<tr :key="key(r)" :class="{ 'pe-outside': outside(r) }" @click="open = open === key(r) ? null : key(r)">
							<td class="pe-reg">{{ r.record }}<span class="grey--text"> {{ r.func === 4 ? 'in' : 'hd' }}</span></td>
							<td>
								{{ r.name }}
								<v-icon v-if="r.watch" x-small color="primary" :title="$t('plugins.WorkshopRS485.machineProfile.read_every_cycle')">mdi-eye</v-icon>
								<v-icon v-if="r.access === 'write'" x-small :title="$t('plugins.WorkshopRS485.machineProfile.can_be_written')">mdi-pencil</v-icon>
							</td>
							<td class="pe-val">
								<template v-if="values[key(r)] && values[key(r)].error"><span class="error--text text-caption">{{ values[key(r)].error }}</span></template>
								<template v-else-if="values[key(r)]">{{ textValue(r, values[key(r)].value) }} <small>{{ r.unit }}</small></template>
								<span v-else class="grey--text">--</span>
							</td>
							<td class="grey--text text-caption">{{ range(r) }}</td>
							<td class="text-right"><v-icon small>{{ open === key(r) ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon></td>
						</tr>
						<tr v-if="open === key(r)" :key="key(r) + '-d'" class="pe-detail">
							<td colspan="5">
								<div v-if="r.description" class="text-body-2 mb-2">{{ r.description }}</div>
								<div v-if="r.options && r.options.length" class="text-caption mb-2">
									<span v-for="o in r.options" :key="o.value" class="mr-3"><b>{{ o.value }}</b> = {{ o.text }}</span>
								</div>
								<div class="text-caption grey--text mb-2">
									{{ r.func === 4 ? $t('plugins.WorkshopRS485.common.input_function_4') : $t('plugins.WorkshopRS485.common.holding_function_3') }} &middot; {{ $t('plugins.WorkshopRS485.machineProfile.scale_n', { n: r.scale }) }}<span v-if="r.defaultValue != null"> &middot; {{ $t('plugins.WorkshopRS485.machineProfile.factory_value', { v: r.defaultValue, unit: r.unit || '' }) }}</span>
								</div>
								<div class="d-flex flex-wrap align-center" style="gap:8px">
									<v-btn x-small outlined :loading="busy === key(r) + 'l'" @click.stop="readOne(r)">{{ $t('plugins.WorkshopRS485.common.read') }}</v-btn>
									<template v-if="r.access === 'write'">
										<v-select v-if="r.options && r.options.length" v-model="newItem" :items="r.options.map(o => ({ text: o.value + ' = ' + o.text, value: o.value }))" dense outlined hide-details class="pe-new-sel" @click.stop />
										<v-text-field v-else v-model.number="newItem" type="number" step="any" :label="$t('plugins.WorkshopRS485.machineProfile.new_value') + (r.unit ? ' (' + r.unit + ')' : '')" dense outlined hide-details class="pe-new" @click.stop />
										<v-btn x-small outlined :color="armed === key(r) ? 'error' : ''" :disabled="newItem === null || newItem === '' || !can('rs485.action', { action: 'write_parameter' })" :loading="busy === key(r) + 'e'" @click.stop="arm(r)">
											{{ armed === key(r) ? $t('plugins.WorkshopRS485.machineProfile.tap_again_to_write') : $t('plugins.WorkshopRS485.common.write') }}
										</v-btn>
									</template>
									<span v-else class="text-caption grey--text">{{ $t('plugins.WorkshopRS485.machineProfile.read_only') }}</span>
								</div>
							</td>
						</tr>
					</template>
				</tbody>
			</v-simple-table>
		</template>

		<!-- ===== alarmas ===== -->
		<template v-else>
			<div class="text-body-2 mb-2">
				<span v-if="!pe.alarm" class="warning--text">{{ $t('plugins.WorkshopRS485.machineProfile.the_profile_doesn_t_say_where') }}</span>
				<span v-else-if="alarmCurrent" class="error--text"><v-icon small color="error" class="mr-1">mdi-alert-octagon</v-icon>{{ $t('plugins.WorkshopRS485.common.active_now') }} <b>{{ alarmCurrent }}</b></span>
				<span v-else class="success--text"><v-icon small color="success" class="mr-1">mdi-check-circle</v-icon>{{ $t('plugins.WorkshopRS485.common.no_active_alarm') }}</span>
				<span v-if="pe.alarm" class="grey--text"> &middot; {{ $t('plugins.WorkshopRS485.machineProfile.code_in_register', { n: pe.alarm.record, kind: pe.alarm.func === 3 ? 'holding' : 'input' }) }}</span>
			</div>
			<v-text-field v-model="filterA" prepend-inner-icon="mdi-magnify" :placeholder="$t('plugins.WorkshopRS485.machineProfile.code_or_word')" dense outlined hide-details clearable class="pe-search mb-2" />
			<div v-if="!alarms.length" class="text-body-2 grey--text pa-3">{{ $t('plugins.WorkshopRS485.machineProfile.the_profile_has_no_alarms') }}</div>
			<div v-for="a in visibleA" :key="a.code" class="pe-alarm" :class="{ active: a.code === alarmCurrent }">
				<div class="d-flex align-center flex-wrap" style="gap:8px">
					<span class="pe-code">{{ a.code }}</span>
					<span class="font-weight-medium">{{ a.text }}</span>
					<v-chip v-if="a.code === alarmCurrent" x-small color="error" text-color="white">{{ $t('plugins.WorkshopRS485.common.active_now_2') }}</v-chip>
					<v-chip x-small outlined>{{ textAction(a.action) }}</v-chip>
				</div>
				<div v-if="a.cause" class="text-body-2 mt-1"><span class="pe-et">{{ $t('plugins.WorkshopRS485.common.cause') }}</span>{{ a.cause }}</div>
				<div v-if="a.that_do" class="text-body-2"><span class="pe-et">{{ $t('plugins.WorkshopRS485.common.what_to_do') }}</span>{{ a.that_do }}</div>
			</div>
		</template>
	</div>
</template>

<script>
import i18n from '../../i18n'

'use strict'

import { mapActions } from 'vuex'
import { action, canMixin } from './api.js'

const ACCION = { pause: i18n.t('plugins.WorkshopRS485.machineProfile.pauses_the_job'), notify: i18n.t('plugins.WorkshopRS485.common.only_warns'), nothing: i18n.t('plugins.WorkshopRS485.machineProfile.does_nothing') };

export default {
	mixins: [canMixin],
	props: {
		cfg: { type: Object, required: true },
		live: { type: Object, default: null }
	},
	data() {
		return {
			tab: 0,
			filter: '',
			filterA: '',
			values: {},
			reading: false,
			busy: null,
			open: null,
			newItem: null,
			armed: null,
			armedTimer: null,
			msg: '',
			msgError: false
		};
	},
	computed: {
		pe() {
			return (this.cfg.options && this.cfg.options.profile_device) || {};
		},
		params() {
			return this.pe.params || [];
		},
		alarms() {
			return this.pe.alarms || [];
		},
		deviceText() {
			const e = this.pe.device || {};
			const nombre = [e.mark, e.model].filter(Boolean).join(' ');
			const com = e.baud ? `${e.baud} 8${e.parity || 'N'}${e.bits_stop || 1}` : '';
			return [nombre, com, e.address ? i18n.t('plugins.WorkshopRS485.machineProfile.address_n', { n: e.address }) : ''].filter(Boolean).join(' · ');
		},
		visible() {
			const f = String(this.filter || '').trim().toLowerCase();
			if (!f) {
				return this.params;
			}
			return this.params.filter(r => String(r.record) === f || (r.name + ' ' + (r.description || '')).toLowerCase().includes(f));
		},
		visibleA() {
			const f = String(this.filterA || '').trim().toLowerCase();
			if (!f) {
				return this.alarms;
			}
			return this.alarms.filter(a => String(a.code) === f || [a.text, a.cause, a.that_do].join(' ').toLowerCase().includes(f));
		},
		alarmCurrent() {
			const v = this.live && this.live.values;
			const without = this.pe.alarm ? (this.pe.alarm.without_alarm || 0) : 0;
			return v && v.alarm != null && v.alarm !== without ? v.alarm : 0;
		}
	},
	watch: {
		open() {
			this.newItem = null;
			this.armed = null;
		}
	},
	beforeDestroy() {
		clearTimeout(this.armedTimer);
	},
	methods: {
		...mapActions('machine', ['sendCode']),
		key(r) {
			return r.func + '-' + r.record;
		},
		textAction(a) {
			return ACCION[a] || i18n.t('plugins.WorkshopRS485.machineProfile.per_the_device');
		},
		range(r) {
			const p = [];
			if (r.min != null) p.push(i18n.t('plugins.WorkshopRS485.machineProfile.min_n', { n: r.min }));
			if (r.max != null) p.push(i18n.t('plugins.WorkshopRS485.machineProfile.max_n', { n: r.max }));
			return p.join(' · ');
		},
		textValue(r, v) {
			const o = (r.options || []).find(x => x.value === v);
			return o ? v + ' = ' + o.text : v;
		},
		outside(r) {
			const x = this.values[this.key(r)];
			if (!x || x.value == null) {
				return false;
			}
			return (r.min != null && x.value < r.min) || (r.max != null && x.value > r.max);
		},
		notice(text, error) {
			this.msg = text;
			this.msgError = !!error;
		},
		saveValues(list) {
			const n = Object.assign({}, this.values);
			for (const x of list) {
				n[x.func + '-' + x.record] = x;
			}
			this.values = n;
		},
		async readAll() {
			this.reading = true;
			this.notice('');
			try {
				const r = await action(this.sendCode, this.cfg.id, 'read_parameters', {});
				this.saveValues(r.values || []);
				const malos = (r.values || []).filter(x => x.error).length;
				this.notice(malos ? i18n.t('plugins.WorkshopRS485.machineProfile.read_n_no_response', { n: malos }) : i18n.t('plugins.WorkshopRS485.machineProfile.read_done'), malos > 0);
			} catch (e) {
				this.notice(e.message, true);
			} finally {
				this.reading = false;
			}
		},
		async readOne(r) {
			this.busy = this.key(r) + 'l';
			try {
				const x = await action(this.sendCode, this.cfg.id, 'read_parameters', { records: [[r.func, r.record]] });
				this.saveValues(x.values || []);
			} catch (e) {
				this.notice(e.message, true);
			} finally {
				this.busy = null;
			}
		},
		arm(r) {
			const k = this.key(r);
			if (this.armed === k) {
				this.armed = null;
				this.write(r);
				return;
			}
			this.armed = k;
			clearTimeout(this.armedTimer);
			this.armedTimer = setTimeout(() => { this.armed = null; }, 4000);
		},
		async write(r) {
			this.busy = this.key(r) + 'e';
			try {
				const x = await action(this.sendCode, this.cfg.id, 'write_parameter', { record: r.record, value: Number(this.newItem) });
				this.saveValues([{ func: 3, record: r.record, value: x.value }]);
				this.notice(x.verified ? i18n.t('plugins.WorkshopRS485.machineProfile.value_verified', { name: r.name, v: x.value, unit: r.unit || '' }) : i18n.t('plugins.WorkshopRS485.machineProfile.device_returned_other', { name: r.name, v: x.value }), !x.verified);
				this.newItem = null;
			} catch (e) {
				this.notice(e.message, true);
			} finally {
				this.busy = null;
			}
		}
	}
};
</script>

<style scoped>
.pe-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	margin-bottom: 8px;
}
.pe-search {
	max-width: 320px;
}
.pe-table tbody tr {
	cursor: pointer;
}
.pe-reg {
	font-family: monospace;
	white-space: nowrap;
}
.pe-val {
	font-weight: 600;
	white-space: nowrap;
}
.pe-outside td {
	background: rgba(128, 128, 128, 0.1);
}
.pe-detail td {
	background: rgba(128, 128, 128, 0.08);
	cursor: default;
	padding-top: 8px !important;
	padding-bottom: 8px !important;
}
.pe-new {
	max-width: 170px;
}
.pe-new-sel {
	max-width: 300px;
}
.pe-alarm {
	border: 1px solid rgba(128, 128, 128, 0.3);
	border-radius: 6px;
	padding: 8px 10px;
	margin-bottom: 6px;
}
.pe-alarm.active {
	border-color: #f44336;
	background: rgba(128, 128, 128, 0.1);
}
.pe-code {
	font-family: monospace;
	font-weight: 700;
	min-width: 36px;
}
.pe-et {
	display: inline-block;
	min-width: 80px;
	opacity: 0.7;
	margin-right: 6px;
}
</style>
