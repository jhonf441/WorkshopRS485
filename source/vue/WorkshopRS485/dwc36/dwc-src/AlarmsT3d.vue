<template>
	<div class="at3">
		<div class="at3-bar">
			<div class="text-body-2">
				<span v-if="current" class="error--text"><v-icon small color="error" class="mr-1">mdi-alert-octagon</v-icon>{{ $t('plugins.WorkshopRS485.common.active_now') }} <b>Err{{ current }}</b></span>
				<span v-else class="success--text"><v-icon small color="success" class="mr-1">mdi-check-circle</v-icon>{{ $t('plugins.WorkshopRS485.common.no_active_alarm') }}</span>
				<span class="grey--text"> &middot; {{ $t('plugins.WorkshopRS485.alarmsT3d.n_manual_codes', { n: alarms.length }) }}</span>
			</div>
			<v-spacer />
			<v-text-field v-model="filter" prepend-inner-icon="mdi-magnify" :placeholder="$t('plugins.WorkshopRS485.alarmsT3d.code_or_word_e_g_39')" dense outlined hide-details clearable class="at3-search" />
		</div>

		<!-- filter by how it is cleared (also serves as a legend) -->
		<div class="at3-filters">
			<v-chip small :outlined="kind !== null" :color="kind === null ? 'primary' : ''" @click="kind = null">{{ $t('plugins.WorkshopRS485.alarmsT3d.all_n', { n: alarms.length }) }}</v-chip>
			<v-chip v-for="(b, k) in DELETED" :key="k" small :outlined="kind !== k" :color="b.color" :text-color="kind === k ? 'white' : ''" :title="b.help" @click="kind = kind === k ? null : k">
				{{ b.text }} &middot; {{ count(k) }}
			</v-chip>
		</div>
		<div v-if="kind" class="text-caption grey--text mt-1">{{ DELETED[kind].text }}: {{ DELETED[kind].help }}</div>

		<div class="at3-list">
			<div v-for="a in visible" :key="a.code" class="at3-row" :class="{ active: a.code === current, open: open(a) }">
				<div class="at3-cab" @click="toggle(a.code)">
					<span class="at3-code">Err{{ a.code }}</span>
					<span class="at3-name">{{ a.name }}</span>
					<v-chip v-if="a.code === current" x-small color="error" text-color="white">{{ $t('plugins.WorkshopRS485.common.active_now_2') }}</v-chip>
					<v-chip x-small :color="DELETED[a.deleted].color" text-color="white">{{ DELETED[a.deleted].text }}</v-chip>
					<v-icon small>{{ open(a) ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
				</div>
				<div v-if="open(a)" class="at3-detail">
					<div><span class="et">{{ $t('plugins.WorkshopRS485.common.what_happens') }}</span><span>{{ a.description }}</span></div>
					<div><span class="et">{{ $t('plugins.WorkshopRS485.common.what_to_do') }}</span><span class="at3-solution">{{ a.solution }}</span></div>
					<div v-if="a.procedure"><span class="et">{{ $t('plugins.WorkshopRS485.alarmsT3d.how_to_clear_it') }}</span><span class="at3-proc">{{ a.procedure }}</span></div>
				</div>
			</div>
			<div v-if="!visible.length" class="text-body-2 grey--text pa-4">{{ $t('plugins.WorkshopRS485.common.nothing_matches_the_search') }}</div>
		</div>
		<div class="text-caption grey--text mt-2">
			{{ $t('plugins.WorkshopRS485.alarmsT3d.source_note') }}
		</div>
	</div>
</template>

<script>
'use strict'

import { deleted } from './api.js'

export default {
	props: {
		alarms: { type: Array, required: true },
		current: { type: Number, default: 0 }
	},
	data() {
		return { filter: '', kind: null, openMap: {}, DELETED: deleted };
	},
	computed: {
		searching() {
			return !!(this.filter || '').trim();
		},
		visible() {
			const f = (this.filter || '').trim().toLowerCase().replace(/^err\s*/, '');
			let list = this.alarms;
			if (this.kind) {
				list = list.filter(a => a.deleted === this.kind);
			}
			if (f) {
				list = list.filter(a => String(a.code) === f ||
					[a.name, a.description, a.solution].some(t => (t || '').toLowerCase().includes(f)));
			}
			// la activa primero
			return list.slice().sort((a, b) => (b.code === this.current) - (a.code === this.current) || a.code - b.code);
		}
	},
	methods: {
		count(k) {
			return this.alarms.filter(a => a.deleted === k).length;
		},
		// open: the one the user touched, the active one, or all if searching for something
		open(a) {
			const v = this.openMap[a.code];
			if (v != null) {
				return v;
			}
			return a.code === this.current || (this.searching && this.visible.length <= 5);
		},
		toggle(code) {
			const a = this.alarms.find(x => x.code === code);
			this.$set(this.openMap, code, !this.open(a));
		}
	}
};
</script>

<style scoped>
.at3-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}
.at3-search {
	max-width: 340px;
	min-width: 220px;
}
.at3-filters {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	margin-top: 10px;
}
.at3-list {
	margin-top: 10px;
	max-height: 560px;
	overflow-y: auto;
	padding-right: 4px;
}
.at3-row {
	border-radius: 8px;
	background: rgba(128, 128, 128, 0.06);
	border-left: 3px solid transparent;
	margin-bottom: 4px;
}
.at3-row.active {
	border-left-color: #ef5350;
	background: rgba(128, 128, 128, 0.1);
}
.at3-cab {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 8px 10px;
	cursor: pointer;
	user-select: none;
}
.at3-code {
	font-family: monospace;
	font-size: 14px;
	font-weight: 600;
	width: 56px;
	flex: 0 0 auto;
}
.at3-name {
	flex: 1;
	min-width: 0;
	font-size: 0.875rem;
	font-weight: 500;
}
.at3-detail {
	padding: 0 12px 10px 74px;
}
.at3-detail > div {
	display: grid;
	grid-template-columns: 110px 1fr;
	gap: 8px;
	padding: 2px 0;
	font-size: 0.875rem;
}
.at3-detail .et {
	font-size: 12px;
	color: var(--tp-faint, #9e9e9e);
}
@media (max-width: 600px) {
	.at3-detail {
		padding-left: 12px;
	}
	.at3-detail > div {
		grid-template-columns: 1fr;
		gap: 0;
	}
}
.at3-solution {
	color: var(--tp-blue-bright, #90caf9);
}
.at3-proc {
	color: var(--tp-orange-bright, #ffb74d);
}
</style>
