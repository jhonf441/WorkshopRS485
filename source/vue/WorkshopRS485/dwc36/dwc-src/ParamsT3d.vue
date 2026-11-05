<template>
	<div class="pt3">
		<!-- barra superior -->
		<div class="pt3-bar">
			<div class="pt3-summary">
				<template v-if="reading">
					<v-progress-circular :value="progress" size="18" width="2" color="primary" class="mr-2" />
					{{ $t('plugins.WorkshopRS485.paramsT3d.reading_from_servo', { n: readN, total: totalRead }) }}
				</template>
				<template v-else-if="hasReading">
					<v-icon small :color="errors ? 'warning' : 'success'" class="mr-1">{{ errors ? 'mdi-alert' : 'mdi-check-circle' }}</v-icon>
					{{ $t('plugins.WorkshopRS485.paramsT3d.documented_internal_read', { doc: counts.documented, internal: counts.internal }) }}
					<span v-if="errors" class="warning--text ml-1">&middot; {{ $t('plugins.WorkshopRS485.paramsT3d.n_no_response', { n: errors }) }}</span>
					<span v-if="hourReading" class="grey--text ml-1">&middot; {{ hourReading }}</span>
				</template>
			</div>
			<v-spacer />
			<v-text-field v-model="filter" prepend-inner-icon="mdi-magnify" :placeholder="$t('plugins.WorkshopRS485.paramsT3d.search_number_name_or_word_e')" dense outlined hide-details clearable class="pt3-search" />
			<v-btn small outlined :loading="reading" @click="readTodo()"><v-icon small left>mdi-refresh</v-icon>{{ $t('plugins.WorkshopRS485.paramsT3d.read_all_again') }}</v-btn>
			<help-tip :title="ht('read_title')" :what="ht('read_what')" :why="ht('read_why')" :how="ht('read_how')" />
			<params-backups :disp-id="dispId" :values="values" :no-exists="noExists" :rows="rows" :edited="edited" :has-reading="hasReading" :reading="reading"
				@compare="compareWith" @restore="applyAsChanges" @load="applyAsChanges" @message="say" />
		</div>
		<div v-if="msg" class="text-body-2 mt-2" :class="msgError ? 'error--text' : 'success--text'">{{ msg }}</div>

		<!-- filtros y comparacion -->
		<div v-if="hasReading" class="d-flex align-center flex-wrap mt-2" style="gap:6px">
			<v-chip-group v-model="view" mandatory active-class="primary--text" class="pt3-views">
				<v-chip small filter value="all">{{ $t('plugins.WorkshopRS485.common.all') }}</v-chip>
				<v-chip small filter value="different">{{ $t('plugins.WorkshopRS485.paramsT3d.different_from_factory_n', { n: counts.different }) }}</v-chip>
				<v-chip small filter value="invalid" :color="counts.invalid ? look('error').color : ''" :text-color="counts.invalid ? 'white' : ''">{{ $t('plugins.WorkshopRS485.paramsT3d.invalid_n', { n: counts.invalid }) }}</v-chip>
				<v-chip v-if="comparing" small filter value="backup">{{ $t('plugins.WorkshopRS485.paramsT3d.different_from_backup_n', { n: counts.vsBackup }) }}</v-chip>
			</v-chip-group>
			<!-- Labels: compact panel that closes when one is chosen (2026-10-10).
			     The filter goes in its own variable: before it was saved in "vista",
			     and the "mandatory" chip-group sent it back to "All" instantly. -->
			<v-menu v-model="menuLabels" offset-y max-width="320" max-height="60vh">
				<template v-slot:activator="{ on, attrs }">
					<v-btn x-small text v-bind="attrs" v-on="on"><v-icon x-small left>mdi-tag-multiple</v-icon>{{ labelFilter ? labels[labelFilter].text : $t('plugins.WorkshopRS485.paramsT3d.filter_by_tag') }}</v-btn>
				</template>
				<v-card class="pa-2 pt3-menu-labels">
					<div class="text-caption grey--text mb-1">{{ $t('plugins.WorkshopRS485.paramsT3d.tap_a_tag_to_filter') }}</div>
					<div class="d-flex flex-wrap" style="gap:4px">
						<span
							v-for="(e, id) in labels" :key="id" class="pt3-label" :class="[e.color, { 'pt3-label-sel': labelFilter === id }]"
							:title="e.help" @click="chooseLabel(id)"
						><v-icon x-small dark>{{ e.icon }}</v-icon>{{ e.text }} <b class="ml-1">{{ countLabel(id) }}</b></span>
					</div>
					<div class="text-caption grey--text mt-2 mb-1">{{ $t('plugins.WorkshopRS485.paramsT3d.risk_of_changing_it') }}</div>
					<div class="d-flex flex-wrap" style="gap:2px 10px">
						<span v-for="(r, id) in risks" :key="id" class="text-caption d-inline-flex align-center" :title="r.text">
							<v-icon x-small :color="r.color" class="mr-1">{{ r.icon }}</v-icon>{{ r.text }}
						</span>
					</div>
				</v-card>
			</v-menu>
			<v-chip v-if="labelFilter" small close @click:close="labelSel = null" :color="look(labels[labelFilter].color).color" :text-color="look(labels[labelFilter].color).textColor">
				<v-icon x-small left>{{ labels[labelFilter].icon }}</v-icon>{{ labels[labelFilter].text }}
			</v-chip>
			<v-spacer />
			<template v-if="comparing">
				<v-chip small :color="look('primary').color" text-color="white" close @click:close="comparing = null">
					<v-icon x-small left>mdi-compare</v-icon>{{ $t('plugins.WorkshopRS485.paramsT3d.comparing_with_backup', { date: (comparing.date || '').replace('T', ' ') }) }}
				</v-chip>
			</template>
		</div>

		<div class="pt3-body">
			<!-- grupos -->
			<div class="pt3-groups">
				<button v-for="g in groupsVisible" :key="g.id" type="button" class="pt3-group" :class="{ active: group === g.id && !filterActive }" @click="group = g.id; filter = ''; view = 'all'; labelSel = null">
					<span class="pt3-group-name"><v-icon small class="mr-1">{{ g.icon || iconsGroup[g.id] || 'mdi-cog' }}</v-icon>{{ g.name }}</span>
					<span class="pt3-group-count">
						<span v-if="pendingOf(g.id)" class="pt3-point" :title="$t('plugins.WorkshopRS485.paramsT3d.unwritten_changes')" />
						<span v-if="invalidOf(g.id)" class="pt3-point red" :title="$t('plugins.WorkshopRS485.paramsT3d.invalid_values_according_to_the_manual')" />
						{{ g.count }}
					</span>
				</button>
			</div>

			<!-- parametros -->
			<div class="pt3-list">
				<div v-if="!filterActive && groupCurrent" class="pt3-group-cab">
					<div class="text-subtitle-1 font-weight-medium">{{ groupCurrent.name }}</div>
					<div class="text-body-2 grey--text">{{ groupCurrent.description }}</div>
					<v-alert v-if="group === 'communication'" dense text type="warning" class="mt-2 mb-0">
						{{ $t('plugins.WorkshopRS485.paramsT3d.if_you_change_the_address_baud') }}
					</v-alert>
					<v-alert v-if="group === 'internal_factory'" dense text type="info" class="mt-2 mb-0">
						{{ $t('plugins.WorkshopRS485.paramsT3d.internal_registers_note', { manual }) }}
					</v-alert>
				</div>
				<div v-else-if="filterActive" class="text-body-2 grey--text mb-2">{{ $t('plugins.WorkshopRS485.paramsT3d.n_parameters', { n: visible.length }) }}</div>

				<param-card v-for="p in visible" :key="p.record" :p="p" :page="self" />
				<div v-if="!visible.length && table.length" class="text-body-2 grey--text pa-4">{{ $t('plugins.WorkshopRS485.paramsT3d.nothing_to_show_with_this_filter') }}</div>
			</div>
		</div>

		<!-- barra de cambios -->
		<div v-if="pending.length || pendingEeprom" class="pt3-changes">
			<template v-if="pending.length">
				<div class="pt3-changes-list">
					<b>{{ $t('plugins.WorkshopRS485.paramsT3d.n_unwritten_changes', { n: pending.length }) }}</b>
					<span v-for="c in pending.slice(0, 6)" :key="c.p.record" class="pt3-change">P-{{ three(c.p.record) }} {{ c.before }} &rarr; <b>{{ c.newItem }}</b></span>
					<span v-if="pending.length > 6">{{ $t('plugins.WorkshopRS485.paramsT3d.and_n_more', { n: pending.length - 6 }) }}</span>
				</div>
				<v-checkbox v-if="hasInvalid && atLeast('admin')" v-model="force" dense hide-details class="mt-0 mr-3" :label="$t('plugins.WorkshopRS485.paramsT3d.force_invalid_values')" color="error" />
				<v-btn small text @click="discard()">{{ $t('plugins.WorkshopRS485.common.discard') }}</v-btn>
				<v-btn small color="primary" :loading="writing" :disabled="(hasInvalid && !force) || !can('rs485.action', { action: 'write_param', data: { force } })" :title="lockWhy('rs485.action', { action: 'write_param', data: { force } })" @click="writeTodo()">
					<v-icon small left>mdi-upload</v-icon>{{ $t('plugins.WorkshopRS485.paramsT3d.write_to_the_servo') }}
				</v-btn>
				<help-tip :title="ht('write_title')" :what="ht('write_what')" :why="ht('write_why')" :if-missing="ht('write_missing')" :how="ht('write_how')" />
			</template>
			<template v-else>
				<div class="pt3-changes-list">
					<v-icon small color="warning" class="mr-1">mdi-alert</v-icon>
					{{ $t('plugins.WorkshopRS485.paramsT3d.n_written_but', { n: pendingEeprom }) }} <b>{{ $t('plugins.WorkshopRS485.paramsT3d.not_saved') }}</b>{{ $t('plugins.WorkshopRS485.paramsT3d.they_re_lost_when_the_servo') }}
				</div>
				<v-btn small :color="armed ? 'error' : 'primary'" :dark="armed" :loading="savingEeprom" :disabled="!can('rs485.action', { action: 'save_eeprom' })" :title="lockWhy('rs485.action', { action: 'save_eeprom' })" @click="touchEeprom()">
					<v-icon small left>mdi-content-save</v-icon>{{ armed ? $t('plugins.WorkshopRS485.paramsT3d.tap_again_store_in_the_servo') : $t('plugins.WorkshopRS485.paramsT3d.save_to_eeprom') }}
				</v-btn>
				<help-tip :title="ht('eeprom_title')" :what="ht('eeprom_what')" :why="ht('eeprom_why')" :how="ht('eeprom_how')" />
			</template>
		</div>
	</div>
</template>

<script>
import { chipLook } from './chip-look.js'
import i18n from '../../i18n'

'use strict'

import { mapActions } from 'vuex'
import { action, info, canMixin, refusal } from './api.js'
import { TOTAL, BY_READING, three, validate } from './params-model.js'
import ParamCard from './ParamCard.vue'
import ParamsBackups from './ParamsBackups.vue'
import HelpTip from './HelpTip.vue' // vue/_shared36
import { backupChanges } from './params-backup.js';

// Values read per device: they survive closing/opening the panel (the whole
// servo is not reread every time).
const CACHE = {};

const tp = (key, params) => i18n.t('plugins.WorkshopRS485.paramsT3d.' + key, params);

export default { mixins: [canMixin],
	components: { HelpTip, ParamCard, ParamsBackups },
	props: {
		dispId: { type: String, required: true }
	},
	data() {
		const c = CACHE[this.dispId] || {};
		return {
			TOTAL,
			table: [],
			groups: [],
			partial: [],
			noExists: 0x5A53,
			generic: false, // the table comes from a JSON profile (Generic.info): its registers, not the servo's 0..255
			regList: [],
			manual: '',
			group: 'mode',
			filter: '',
			view: 'all',
			labelSel: null, // filtro por etiqueta (aparte de "vista")
			menuLabels: false,
			values: c.values || {},
			hourReading: c.hour || null,
			edited: {},
			written: c.written || {},
			reading: false,
			readN: 0,
			writing: false,
			force: false,
			armed: false,
			armedTimer: null,
			savingEeprom: false,
			comparing: c.comparing || null,
			labels: {},
			risks: {},
			iconsGroup: {},
			functionsDi: {},
			functionsDo: {},
			msg: null,
			msgError: false
		};
	},
	computed: {
		// the page itself, for the cards: they read its state and call its actions
		self() {
			return this;
		},
		modeServo() {
			// P-004: 0 = position (normal with the Duet), 1 = speed, 2 = torque, 3-5 mixed
			const v = this.values[4];
			return v && !v.error ? v.value : null;
		},
		// All the rows: documented + partially documented + internal ones read
		rows() {
			const doc = this.table.map(p => ({ ...p, kind: 'doc' }));
			const known = new Set(doc.map(p => p.record));
			const parc = this.partial.filter(p => !known.has(p.record)).map(p => ({
				record: p.record, name: p.name, kind: 'partial', group: 'internal_factory', options: [], digits: [], description: '', note: tp('mentioned_in_the_manual_text_no')
			}));
			parc.forEach(p => known.add(p.record));
			const internal = [];
			for (let r = 0; r < (this.generic ? 0 : TOTAL); r++) {
				const v = this.values[r];
				if (!known.has(r) && v && (v.error || v.value !== this.noExists)) {
					internal.push({ record: r, name: tp('factory_internal_undocumented'), kind: 'internal', group: 'internal_factory', options: [], digits: [], description: '', note: '' });
				}
			}
			return [...doc, ...parc, ...internal].sort((a, b) => a.record - b.record);
		},
		groupsAll() {
			return this.generic ? this.groups : [...this.groups, { id: 'internal_factory', name: tp('factory_internals'), description: tp('undocumented_registers_read_only') }];
		},
		groupsVisible() {
			return this.groupsAll.map(g => ({ ...g, count: this.rows.filter(p => p.group === g.id).length })).filter(g => g.count);
		},
		groupCurrent() {
			return this.groupsAll.find(g => g.id === this.group);
		},
		labelFilter() {
			return this.labelSel && this.labels[this.labelSel] ? this.labelSel : null;
		},
		filterActive() {
			return !!(this.filter || '').trim() || this.view !== 'all' || !!this.labelFilter;
		},
		visible() {
			let list = this.rows;
			const f = (this.filter || '').trim().toLowerCase();
			if (this.view === 'different') {
				list = list.filter(p => this.differentOfFactory(p));
			} else if (this.view === 'invalid') {
				list = list.filter(p => this.invalidCurrent(p));
			} else if (this.view === 'backup') {
				list = list.filter(p => this.differentOfBackup(p));
			}
			// the label is combined with the other filters
			if (this.labelFilter) {
				list = list.filter(p => (p.labels || []).includes(this.labelFilter));
			}
			if (!f && this.view === 'all' && !this.labelFilter) {
				return list.filter(p => p.group === this.group);
			}
			if (f) {
				const num = f.replace(/^p-?0*/, '') || '0';
				list = list.filter(p => String(p.record) === num || p.name.toLowerCase().includes(f) ||
					(p.description || '').toLowerCase().includes(f) || (p.note || '').toLowerCase().includes(f));
			}
			return list;
		},
		hasReading() {
			return Object.keys(this.values).length > 0;
		},
		errors() {
			return Object.values(this.values).filter(v => v.error).length;
		},
		counts() {
			const rows = this.rows;
			return {
				documented: rows.filter(p => p.kind === 'doc' && this.values[p.record] && !this.values[p.record].error).length,
				internal: rows.filter(p => p.kind !== 'doc').length,
				different: rows.filter(p => this.differentOfFactory(p)).length,
				invalid: rows.filter(p => this.invalidCurrent(p)).length,
				vsBackup: this.comparing ? rows.filter(p => this.differentOfBackup(p)).length : 0
			};
		},
		progress() {
			return this.readN / this.totalRead * 100;
		},
		// what is read: the 256 registers of the servo, or the registers the profile lists (a device from a JSON profile)
		totalRead() {
			return this.generic ? this.regList.length : TOTAL;
		},
		pending() {
			return this.rows.filter(p => this.isPending(p)).map(p => ({
				p, newItem: Number(this.edited[p.record]),
				before: this.values[p.record] && !this.values[p.record].error ? this.values[p.record].value : '?'
			}));
		},
		hasInvalid() {
			return this.pending.some(c => this.invalidEdited(c.p));
		},
		pendingEeprom() {
			return this.generic ? 0 : Object.keys(this.written).length; // only the servo has a memory to save
		}
	},
	async mounted() {
		try {
			const r = await info(this.sendCode, this.dispId);
			this.table = r.params || [];
			this.groups = r.groups || [];
			this.partial = r.partial || [];
			this.noExists = r.no_exists != null ? r.no_exists : this.noExists;
			this.generic = !!r.generic;
			this.regList = this.generic ? this.table.map(p => [3, p.record]) : [];
			this.manual = r.manual || tp('t3d_manual');
			const a = r.help || {};
			this.labels = a.labels || {};
			this.risks = a.risks || {};
			this.iconsGroup = a.icons_group || {};
			this.functionsDi = a.functions_di || {};
			this.functionsDo = a.functions_do || {};
		} catch (e) {
			this.msg = refusal(e) || tp('could_not_load_the_table') + (e.message || e);
			this.msgError = true;
			return;
		}
		if (!this.hasReading) {
			this.readTodo();
		}
	},
	beforeDestroy() {
		clearTimeout(this.armedTimer);
		CACHE[this.dispId] = { values: this.values, hour: this.hourReading, written: this.written, comparing: this.comparing };
	},
	methods: {
		ht(k) {
			return this.$t('plugins.WorkshopRS485.paramsT3d.help_' + k)
		},
		// the fill and the text of a filled chip, readable (chip-look.js)
		look(name) {
			return chipLook(name);
		},
		...mapActions('machine', ['sendCode']),
		three,
		chooseLabel(id) {
			this.labelSel = this.labelSel === id ? null : id;
			this.menuLabels = false;
		},
		countLabel(id) {
			return this.rows.filter(p => (p.labels || []).includes(id)).length;
		},
		valueFor(p) {
			const v = this.values[p.record];
			return v && !v.error && v.value !== this.noExists ? v.value : null;
		},
		choose(p, v) {
			if (p.only_reading) {
				return;
			}
			this.edit(p, this.valueFor(p) === v ? null : v);
		},
		invalidCurrent(p) {
			const v = this.values[p.record];
			return v && !v.error && v.value !== this.noExists ? validate(p, v.value, tp) : null;
		},
		invalidEdited(p) {
			const v = this.edited[p.record];
			return v === null || v === undefined || v === '' ? null : validate(p, Number(v), tp);
		},
		differentOfFactory(p) {
			const v = this.values[p.record];
			return p.kind === 'doc' && p.defaultValue != null && v && !v.error && v.value !== this.noExists && v.value !== p.defaultValue;
		},
		valueBackup(p) {
			const r = this.comparing && this.comparing.params[p.record];
			return r == null ? null : r;
		},
		differentOfBackup(p) {
			const r = this.valueBackup(p);
			const v = this.values[p.record];
			return r != null && v && !v.error && v.value !== r;
		},
		isPending(p) {
			const v = this.edited[p.record];
			if (v === null || v === undefined || v === '') {
				return false;
			}
			const current = this.values[p.record];
			return !current || current.error || Number(v) !== current.value;
		},
		pendingOf(groupId) {
			return this.rows.some(p => p.group === groupId && this.isPending(p));
		},
		invalidOf(groupId) {
			return this.rows.some(p => p.group === groupId && this.invalidCurrent(p));
		},
		edit(p, v) {
			if (v === null || v === undefined || v === '') {
				this.$delete(this.edited, p.record);
			} else {
				this.$set(this.edited, p.record, v);
			}
		},
		discard() {
			this.edited = {};
			this.force = false;
		},
		async readTodo() {
			this.reading = true;
			this.readN = 0;
			this.msg = null;
			const nuevos = {};
			try {
				const total = this.totalRead;
				for (let i = 0; i < total; i += BY_READING) {
					// the servo: registers i..i+15; a profile: the next ones of its list as [function, register] (it answers raw, the card applies the scale)
					const regs = this.generic ? this.regList.slice(i, i + BY_READING) : Array.from({ length: Math.min(BY_READING, total - i) }, (_, k) => i + k);
					const r = await action(this.sendCode, this.dispId, 'read_params', { records: regs });
					for (const v of r.values) {
						nuevos[v.record] = v.error ? { error: v.error } : { value: this.generic ? v.raw : v.value };
					}
					this.readN = Math.min(total, i + regs.length);
				}
				this.values = nuevos;
				const d = new Date();
				this.hourReading = tp('read_at', { time: String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') });
			} catch (e) {
				this.msg = refusal(e) || tp('reading_stopped_check', { error: e.message || String(e) });
				this.msgError = true;
				if (Object.keys(nuevos).length) {
					this.values = { ...this.values, ...nuevos };
				}
			} finally {
				this.reading = false;
			}
		},
		async writeTodo() {
			this.writing = true;
			this.msg = null;
			const lista = this.pending.slice();
			let ok = 0;
			const faults = [];
			for (const c of lista) {
				try {
					const r = await action(this.sendCode, this.dispId, 'write_param', { record: c.p.record, value: c.newItem, force: this.force, raw: true });
					this.$set(this.values, c.p.record, { value: r.value });
					this.$set(this.written, c.p.record, true);
					this.$delete(this.edited, c.p.record);
					ok++;
				} catch (e) {
					faults.push(`P-${this.three(c.p.record)}: ${e.message || e}`);
				}
			}
			this.writing = false;
			this.force = false;
			if (faults.length) {
				this.msg = tp('n_written_some_failed', { n: ok, list: faults.join(' | ') });
				this.msgError = true;
			} else {
				this.msg = tp('n_written_verified', { n: ok });
				this.msgError = false;
			}
		},
		touchEeprom() {
			if (!this.armed) {
				this.armed = true;
				clearTimeout(this.armedTimer);
				this.armedTimer = setTimeout(() => { this.armed = false; }, 4000);
				return;
			}
			this.armed = false;
			this.saveEeprom();
		},
		async saveEeprom() {
			this.savingEeprom = true;
			try {
				await action(this.sendCode, this.dispId, 'save_eeprom');
				this.written = {};
				this.msg = tp('saved_in_the_servo_eeprom_the');
				this.msgError = false;
			} catch (e) {
				this.msg = refusal(e) || i18n.t('plugins.WorkshopRS485.common.could_not_save') + (e.message || e);
				this.msgError = true;
			} finally {
				this.savingEeprom = false;
			}
		},
		// the message line of the page, for the backups panel too
		say(text, isError) {
			this.msg = text;
			this.msgError = !!isError;
		},
		// -- respaldos ---------------------------------------------------------
		// Compare shows the differences with a backup the service read; the values to load go to "cambios" (nothing is written to the servo)
		compareWith(d) {
			this.comparing = d;
			this.view = 'backup';
		},
		// Only the documented and writable parameters go to "cambios"; the factory internal ones stay in the backup as a reference.
		// It looks at the rows and the values as they are now (they may have changed while the preview was open). Returns how many changed.
		applyAsChanges(d) {
			const plan = backupChanges(d, this.rows, this.values, tp);
			plan.changes.forEach(ch => this.$set(this.edited, ch.record, ch.after));
			const n = plan.changes.length;
			this.msg = n ? tp('backup_values_as_changes', { date: String(d.date || '').slice(0, 10), n })
				: tp('the_backup_matches_what_the_servo');
			this.msgError = false;
			this.filter = '';
			return n;
		}
	}
};
</script>

<style scoped>
.pt3-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}
.pt3-summary {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	font-size: 13px;
}
.pt3-search {
	max-width: 340px;
	min-width: 220px;
}
.pt3-views {
	padding: 0;
}
.pt3-body {
	display: grid;
	grid-template-columns: 230px 1fr;
	gap: 12px;
	margin-top: 10px;
}
@media (max-width: 860px) {
	.pt3-body {
		grid-template-columns: 1fr;
	}
	.pt3-groups {
		flex-direction: row !important;
		flex-wrap: wrap;
		max-height: none !important;
	}
}
.pt3-groups {
	display: flex;
	flex-direction: column;
	gap: 3px;
	max-height: 560px;
	overflow-y: auto;
}
.pt3-group {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
	text-align: left;
	padding: 7px 10px;
	border-radius: 6px;
	background: rgba(128, 128, 128, 0.06);
	color: inherit;
	cursor: pointer;
	font-size: 13px;
	border: 1px solid transparent;
}
.pt3-group:hover {
	background: rgba(128, 128, 128, 0.14);
}
.pt3-group.active {
	border-color: #2196f3;
	background: rgba(128, 128, 128, 0.1);
}
.pt3-group-count {
	display: flex;
	align-items: center;
	gap: 4px;
	color: var(--tp-faint, #9e9e9e);
	font-size: 12px;
}
.pt3-point {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: #ffa726;
}
.pt3-point.red {
	background: #ef5350;
}
.pt3-list {
	min-width: 0;
	max-height: 560px;
	overflow-y: auto;
	padding-right: 4px;
}
.pt3-group-cab {
	margin-bottom: 10px;
}
.pt3-label {
	display: inline-flex;
	align-items: center;
	gap: 3px;
	padding: 1px 7px 1px 5px;
	border-radius: 10px;
	font-size: 11px;
	color: #fff;
	cursor: pointer;
	white-space: nowrap;
}
.pt3-menu-labels {
	max-height: 60vh;
	overflow-y: auto;
}
.pt3-label-sel {
	outline: 2px solid #fff;
}
.pt3-legend {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 3px 0;
	cursor: pointer;
}
.pt3-label {
	font-size: 11px;
	color: var(--tp-faint, #9e9e9e);
	margin-bottom: 2px;
}
.pt3-changes {
	position: sticky;
	bottom: 0;
	z-index: 2;
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	margin-top: 10px;
	padding: 10px 12px;
	border-radius: 8px;
	background: var(--tp-superficie, #263238);
	border: 1px solid rgba(33, 150, 243, 0.5);
}
.pt3-changes-list {
	flex: 1 1 300px;
	font-size: 13px;
}
.pt3-change {
	margin-left: 10px;
	white-space: nowrap;
	font-variant-numeric: tabular-nums;
}
</style>
