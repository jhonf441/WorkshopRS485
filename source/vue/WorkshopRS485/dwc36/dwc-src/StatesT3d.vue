<template>
	<div class="et3">
		<div class="et3-bar">
			<div class="et3-summary">
				<template v-if="error">
					<v-icon small color="warning" class="mr-1">mdi-alert</v-icon>
					<span class="warning--text">{{ error }}</span>
				</template>
				<template v-else-if="hour">
					<span class="et3-heartbeat" :class="{ paused: paused }" />
					{{ paused ? $t('plugins.WorkshopRS485.statesT3d.paused') : $t('plugins.WorkshopRS485.statesT3d.live') }} &middot; {{ hour }}
				</template>
				<template v-else>
					<v-progress-circular indeterminate size="16" width="2" class="mr-2" />{{ $t('plugins.WorkshopRS485.statesT3d.reading_servo_states') }}
				</template>
			</div>
			<v-spacer />
			<v-text-field v-model="filter" prepend-inner-icon="mdi-magnify" :placeholder="$t('plugins.WorkshopRS485.statesT3d.search_e_g_speed_di')" dense outlined hide-details clearable class="et3-search" />
			<v-btn small outlined @click="paused = !paused">
				<v-icon small left>{{ paused ? 'mdi-play' : 'mdi-pause' }}</v-icon>{{ paused ? $t('plugins.WorkshopRS485.statesT3d.follow') : $t('plugins.WorkshopRS485.statesT3d.pause') }}
			</v-btn>
		</div>

		<div class="et3-groups">
			<div v-for="g in groupsVisible" :key="g.id" class="et3-group">
				<div class="et3-group-name" @click="$set(collapsed, g.id, !collapsed[g.id])">
					<span>{{ g.name }}</span>
					<span class="grey--text font-weight-regular">{{ statesOf(g.id).length }}</span>
					<v-spacer />
					<v-icon small>{{ collapsed[g.id] && !searching ? 'mdi-chevron-down' : 'mdi-chevron-up' }}</v-icon>
				</div>
				<div v-for="e in (collapsed[g.id] && !searching ? [] : statesOf(g.id))" :key="e.id" class="et3-row" :class="{ change: change(e.id) }" :title="title(e)">
					<div class="et3-name">
						{{ e.name }}
						<div v-if="e.note" class="et3-note">{{ e.note }}</div>
					</div>

					<!-- alarma -->
					<div v-if="e.id === 'alarm'" class="et3-value">
						<template v-if="values.alarm == null">&mdash;</template>
						<span v-else-if="!values.alarm" class="success--text">{{ $t('plugins.WorkshopRS485.statesT3d.no_alarm') }}</span>
						<span v-else class="error--text">Err{{ values.alarm }} <small class="error--text">{{ nameAlarm(values.alarm) }}</small></span>
					</div>

					<!-- entradas / salidas digitales: un led por borne -->
					<div v-else-if="e.unit === 'bits'" class="et3-bits">
						<span v-for="b in (e.id === 'di' ? 8 : 6)" :key="b" class="et3-bit" :class="{ on: bit(e.id, b - 1) }">
							{{ e.id === 'di' ? 'DI' : 'DO' }}{{ b }}
						</span>
					</div>

					<div v-else class="et3-value">
						{{ format(values[e.id]) }}<small v-if="e.unit"> {{ e.unit }}</small>
					</div>
				</div>
			</div>
		</div>
		<div v-if="!groupsVisible.length" class="text-body-2 grey--text pa-3">{{ $t('plugins.WorkshopRS485.common.nothing_matches_the_search') }}</div>
		<div class="text-caption grey--text mt-2">
			{{ $t('plugins.WorkshopRS485.statesT3d.values_that_just_changed_are_highlighted') }}
		</div>
	</div>
</template>

<script>
import i18n from '../../i18n'

'use strict'

import { mapActions } from 'vuex'
import { action, hex } from './api.js'

export default {
	props: {
		dispId: { type: String, required: true },
		table: { type: Object, required: true }
	},
	data() {
		return {
			values: {},
			hour: null,
			error: null,
			paused: false,
			filter: '',
			collapsed: {},
			changed: {},	// id -> moment it changed (to highlight it)
			live: true,
			timer: null
		};
	},
	computed: {
		groups() {
			return this.table.groups_states || [];
		},
		searching() {
			return !!(this.filter || '').trim();
		},
		groupsVisible() {
			return this.groups.filter(g => this.statesOf(g.id).length);
		},
		alarms() {
			return Object.fromEntries((this.table.alarms || []).map(a => [a.code, a]));
		}
	},
	mounted() {
		this.cycle();
	},
	beforeDestroy() {
		this.live = false;
		clearTimeout(this.timer);
	},
	methods: {
		...mapActions('machine', ['sendCode']),
		async cycle() {
			if (!this.live) {
				return;
			}
			// only with the page in view (DWC keeps it alive with keep-alive when going to another)
			if (!this.paused && !document.hidden && this.$el && this.$el.isConnected !== false) {
				try {
					const r = await action(this.sendCode, this.dispId, 'read_states');
					const nuevos = r.values || {};
					const ahora = Date.now();
					if (Object.keys(this.values).length) {
						for (const k of Object.keys(nuevos)) {
							if (nuevos[k] !== this.values[k]) {
								this.$set(this.changed, k, ahora);
							}
						}
					}
					this.values = nuevos;
					const d = new Date();
					this.hour = [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');
					this.error = null;
				} catch (e) {
					this.error = i18n.t('plugins.WorkshopRS485.statesT3d.no_answer_from_the_servo') + (e.message || e);
				}
			}
			// no response: retry more slowly so as not to fill the bus queue
			this.timer = setTimeout(() => this.cycle(), this.error ? 3000 : 1000);
		},
		statesOf(group) {
			const f = (this.filter || '').trim().toLowerCase();
			return (this.table.states || []).filter(e => e.group === group &&
				(!f || [e.name, e.note, e.id].some(t => (t || '').toLowerCase().includes(f))));
		},
		change(id) {
			const t = this.changed[id];
			return !!t && Date.now() - t < 1500;
		},
		nameAlarm(c) {
			return this.alarms[c] ? this.alarms[c].name : i18n.t('plugins.WorkshopRS485.statesT3d.undocumented');
		},
		bit(id, n) {
			const v = this.values[id];
			return v != null && ((v >> n) & 1) === 1;
		},
		format(v) {
			if (v == null) {
				return '—';
			}
			return typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(2).replace(/0$/, '') : v.toLocaleString('is-CO');
		},
		title(e) {
			const regs = e.record_height != null ? i18n.t('plugins.WorkshopRS485.statesT3d.low_high_32_bits', { low: hex(e.record), high: hex(e.record_height) }) : hex(e.record);
			return i18n.t('plugins.WorkshopRS485.statesT3d.register_function_4', { regs }) + (e.scale !== 1 ? ' · ' + i18n.t('plugins.WorkshopRS485.statesT3d.scale_x', { n: e.scale }) : '');
		}
	}
};
</script>

<style scoped>
.et3-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}
.et3-summary {
	display: flex;
	align-items: center;
	font-size: 13px;
}
.et3-heartbeat {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: #66bb6a;
	margin-right: 6px;
	animation: et3-latir 1s ease-in-out infinite;
}
.et3-heartbeat.paused {
	background: #9e9e9e;
	animation: none;
}
@keyframes et3-latir {
	50% {
		opacity: 0.3;
	}
}
.et3-groups {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
	gap: 10px;
	margin-top: 10px;
}
.et3-group {
	background: rgba(128, 128, 128, 0.06);
	border-radius: 8px;
	padding: 8px 12px;
}
.et3-group-name {
	display: flex;
	align-items: center;
	gap: 6px;
	font-size: 13px;
	font-weight: 600;
	margin-bottom: 4px;
	cursor: pointer;
	user-select: none;
}
.et3-search {
	max-width: 260px;
	min-width: 180px;
}
.et3-row.change .et3-value {
	color: var(--tp-amarillo, #ffca28);
}
.et3-row .et3-value {
	transition: color 0.6s;
}
.et3-row {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: 10px;
	padding: 5px 0;
	border-top: 1px solid rgba(128, 128, 128, 0.15);
}
.et3-name {
	font-size: 13px;
	min-width: 0;
}
.et3-note {
	font-size: 11px;
	color: var(--tp-faint, #9e9e9e);
}
.et3-value {
	font-size: 16px;
	font-weight: 500;
	font-variant-numeric: tabular-nums;
	text-align: right;
	white-space: nowrap;
}
.et3-value small {
	font-size: 11px;
	color: var(--tp-faint, #9e9e9e);
	font-weight: 400;
}
.et3-bits {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 3px;
}
.et3-bit {
	font-size: 10px;
	font-family: monospace;
	padding: 1px 4px;
	border-radius: 3px;
	background: rgba(128, 128, 128, 0.2);
	color: var(--tp-faint, #9e9e9e);
}
.et3-bit.on {
	background: #43a047;
	color: #fff;
}
</style>
