<template>
	<div class="pt3-param" :class="{ pending: isPending(p), written: written[p.record], invalido: !!invalidCurrent(p), inactive: !modeUsed(p) }">
		<!-- cabecera: icono, numero, nombre, etiquetas, riesgo -->
		<div class="pt3-cab">
			<div class="pt3-icon" :class="'risk-' + (p.risk || 'low')">
				<v-icon small>{{ iconGroup(p) }}</v-icon>
			</div>
			<div class="pt3-title">
				<div class="d-flex align-center flex-wrap" style="gap:6px">
					<span class="pt3-num">P-{{ three(p.record) }}</span>
					<span class="text-body-1 font-weight-medium">{{ p.name }}</span>
					<v-icon v-if="p.risk && risks[p.risk]" small :color="risks[p.risk].color">{{ risks[p.risk].icon }}</v-icon><help-tip v-if="p.risk && risks[p.risk]" :title="p.name">{{ risks[p.risk].text }}</help-tip>
					<v-chip v-if="written[p.record]" x-small color="warning" text-color="black"><v-icon x-small left>mdi-content-save-alert</v-icon>{{ $t('plugins.WorkshopRS485.paramsT3d.written_not_in_eeprom') }}</v-chip>
					<v-chip v-if="differentOfFactory(p)" x-small color="amber darken-2" text-color="black"><v-icon x-small left>mdi-pencil</v-icon>{{ $t('plugins.WorkshopRS485.paramsT3d.changed') }}</v-chip>
				</div>
				<div class="pt3-labels">
					<span v-for="e in labelsOf(p)" :key="e.id" class="pt3-label" :class="e.color" @click="chooseLabel(e.id)"><v-icon x-small dark>{{ e.icon }}</v-icon>{{ e.text }}</span>
					<help-tip v-if="labelsOf(p).length" :title="p.name"><p v-for="e in labelsOf(p)" :key="e.id" class="mb-1"><b>{{ e.text }}</b>: {{ e.help }}</p></help-tip>
					<span v-if="p.kind === 'doc' && p.mode" class="pt3-mode" :class="{ used: modeUsed(p) }"><v-icon x-small>{{ modeUsed(p) ? 'mdi-check' : 'mdi-minus' }}</v-icon>{{ $t('plugins.WorkshopRS485.paramsT3d.mode_n', { mode: p.mode }) }}</span>
					<help-tip v-if="p.kind === 'doc' && p.mode" :title="$t('plugins.WorkshopRS485.paramsT3d.mode_n', { mode: p.mode })">{{ modeUsed(p) ? $t('plugins.WorkshopRS485.paramsT3d.has_effect_in_mode') : $t('plugins.WorkshopRS485.paramsT3d.no_effect_in_mode', { modes: textMode(p.mode) }) }}</help-tip>
				</div>
			</div>
		</div>

		<!-- que hace -->
		<div v-if="p.that_does" class="pt3-that-does">{{ p.that_does }}</div>
		<div v-if="p.note && p.note !== p.that_does" class="pt3-note"><v-icon x-small color="info" class="mr-1">mdi-lightbulb-on-outline</v-icon>{{ p.note }}</div>
		<div v-if="invalidCurrent(p)" class="text-caption error--text mt-1"><v-icon x-small color="error">mdi-alert</v-icon> {{ $t('plugins.WorkshopRS485.paramsT3d.current_value_invalid', { why: invalidCurrent(p) }) }}</div>

		<!-- valor / permitido / cambiar -->
		<div class="pt3-body-param">
			<div class="pt3-box">
				<div class="pt3-label"><v-icon x-small>mdi-chip</v-icon> {{ $t('plugins.WorkshopRS485.paramsT3d.on_the_servo') }}</div>
				<div v-if="values[p.record] && values[p.record].error" class="warning--text text-body-2" :title="values[p.record].error">{{ $t('plugins.WorkshopRS485.common.no_response') }}</div>
				<div v-else-if="values[p.record] && values[p.record].value === noExists" class="grey--text text-body-2" :title="$t('plugins.WorkshopRS485.paramsT3d.the_servo_answers_0x5a53_it_does')">{{ $t('plugins.WorkshopRS485.paramsT3d.does_not_report_it') }}</div>
				<template v-else-if="values[p.record]">
					<div class="pt3-current">{{ show(p, values[p.record].value) }}<small v-if="unitOf(p)"> {{ unitOf(p) }}</small></div>
					<div v-if="meaning(p, values[p.record].value)" class="pt3-meaning">{{ meaning(p, values[p.record].value) }}</div>
					<div v-if="p.scale && p.scale !== 1" class="text-caption grey--text">{{ $t('plugins.WorkshopRS485.paramsT3d.stored_value', { v: values[p.record].value }) }}</div>
				</template>
				<div v-else class="grey--text">&mdash;</div>
			</div>

			<div v-if="p.kind === 'doc'" class="pt3-box pt3-box-wide">
				<div class="pt3-label"><v-icon x-small>mdi-arrow-expand-horizontal</v-icon> {{ $t('plugins.WorkshopRS485.paramsT3d.allowed') }}</div>
				<div v-if="p.options.length" class="pt3-buttons">
					<button v-for="o in p.options" :key="o.value" type="button" class="pt3-button" :disabled="p.only_reading"
						:class="{ current: valueFor(p) === o.value, chosen: edited[p.record] != null && Number(edited[p.record]) === o.value }"
						:title="p.defaultValue === o.value ? $t('plugins.WorkshopRS485.paramsT3d.factory_value') : ''" @click="choose(p, o.value)">
						<b>{{ o.value }}</b> {{ o.text }}<v-icon v-if="p.defaultValue === o.value" x-small class="ml-1">mdi-factory</v-icon>
					</button>
				</div>
				<template v-else>
					<div class="pt3-span">
						<span>{{ show(p, p.min) }}</span>
						<div class="pt3-bar-span">
							<div v-if="p.defaultValue != null" class="pt3-mark-factory" :style="{ left: posSpan(p, p.defaultValue) + '%' }" :title="$t('plugins.WorkshopRS485.paramsT3d.factory')" />
							<div v-if="valueFor(p) != null" class="pt3-mark-current" :class="{ outside: invalidCurrent(p) }" :style="{ left: posSpan(p, valueFor(p)) + '%' }" :title="$t('plugins.WorkshopRS485.paramsT3d.current')" />
							<div v-if="edited[p.record] != null && edited[p.record] !== ''" class="pt3-mark-new" :style="{ left: posSpan(p, Number(edited[p.record])) + '%' }" :title="$t('plugins.WorkshopRS485.paramsT3d.new')" />
						</div>
						<span>{{ show(p, p.max) }}</span>
						<small v-if="unitOf(p)" class="grey--text">{{ unitOf(p) }}</small>
					</div>
					<div v-if="p.digits.length" class="text-caption grey--text"><v-icon x-small>mdi-numeric</v-icon> {{ $t('plugins.WorkshopRS485.paramsT3d.by_digits', { max: p.digits[0].max }) }}</div>
				</template>
				<div class="pt3-factory">
					<v-icon x-small>mdi-factory</v-icon> {{ $t('plugins.WorkshopRS485.paramsT3d.factory_colon') }}
					<b v-if="p.defaultValue != null">{{ show(p, p.defaultValue) }}<span v-if="meaning(p, p.defaultValue)" class="font-weight-regular"> &middot; {{ meaning(p, p.defaultValue) }}</span></b>
					<span v-else class="grey--text">{{ p.of_motor ? $t('plugins.WorkshopRS485.paramsT3d.depends_on_motor') : $t('plugins.WorkshopRS485.paramsT3d.depends_on_drive') }}</span>
				</div>
				<div v-if="comparing" class="pt3-factory" :class="{ 'purple--text text--lighten-2 font-weight-bold': differentOfBackup(p) }">
					<v-icon x-small>mdi-compare</v-icon> {{ $t('plugins.WorkshopRS485.paramsT3d.in_backup_value', { v: valueBackup(p) == null ? '—' : show(p, valueBackup(p)) }) }}
				</div>
			</div>
			<div v-else-if="comparing" class="pt3-box">
				<div class="pt3-label"><v-icon x-small>mdi-compare</v-icon> {{ $t('plugins.WorkshopRS485.paramsT3d.in_the_backup') }}</div>
				<div class="text-body-2" :class="{ 'purple--text text--lighten-2 font-weight-bold': differentOfBackup(p) }">{{ valueBackup(p) == null ? '—' : valueBackup(p) }}</div>
			</div>

			<div v-if="p.kind === 'doc' && !p.only_reading" class="pt3-box">
				<div class="pt3-label"><v-icon x-small>mdi-pencil</v-icon> {{ $t('plugins.WorkshopRS485.paramsT3d.change_to') }}<span v-if="p.scale && p.scale !== 1"> {{ $t('plugins.WorkshopRS485.paramsT3d.saved_value') }}</span></div>
				<template v-if="!p.options.length">
					<div class="d-flex align-center" style="gap:4px">
						<input :value="edited[p.record]" type="number" :min="p.min" :max="p.max" class="pt3-input" :class="{ outside: invalidEdited(p) }"
							:placeholder="valueFor(p) != null ? String(valueFor(p)) : ''" @input="e => edit(p, e.target.value)">
						<v-btn :aria-label="$t('plugins.WorkshopRS485.shared.aria_close')" v-if="edited[p.record] != null" x-small icon @click="edit(p, null)"><v-icon x-small>mdi-close</v-icon></v-btn>
					</div>
					<div v-if="edited[p.record] != null && meaning(p, Number(edited[p.record]))" class="text-caption">= {{ meaning(p, Number(edited[p.record])) }}</div>
				</template>
				<div v-else class="text-caption grey--text">
					{{ edited[p.record] != null ? $t('plugins.WorkshopRS485.paramsT3d.new_value', { v: edited[p.record] }) : $t('plugins.WorkshopRS485.paramsT3d.tap_an_option') }}
					<v-btn :aria-label="$t('plugins.WorkshopRS485.shared.aria_close')" v-if="edited[p.record] != null" x-small icon @click="edit(p, null)"><v-icon x-small>mdi-close</v-icon></v-btn>
				</div>
				<div v-if="invalidEdited(p)" class="text-caption error--text">{{ invalidEdited(p) }}</div>
				<v-btn v-else-if="differentOfFactory(p)" x-small text color="amber" class="px-0 mt-1" @click="edit(p, p.defaultValue)"><v-icon x-small left>mdi-backup-restore</v-icon>{{ $t('plugins.WorkshopRS485.paramsT3d.back_to_factory') }}</v-btn>
			</div>
		</div>

		<div v-if="p.description" class="pt3-original"><v-icon x-small>mdi-book-open-variant</v-icon> {{ $t('plugins.WorkshopRS485.paramsT3d.manual_text', { text: p.description }) }}</div>
	</div>
</template>

<script>
import i18n from '../../i18n'

'use strict'

import { three, unitOf, show, textOption, posSpan, modeUsed, textMode } from './params-model.js'
import HelpTip from './HelpTip.vue' // vue/_shared36

// One parameter of the T3D servo panel: its name, labels and risk, the value in the servo, what the manual allows and the field to change it.
// The page (ParamsT3d.vue) is `page`: it owns the state and the actions; nothing here talks to the servo.
export default {
	components: { HelpTip },
	props: {
		p: { type: Object, required: true },
		page: { type: Object, required: true }
	},
	computed: {
		values() { return this.page.values; },
		edited() { return this.page.edited; },
		written() { return this.page.written; },
		risks() { return this.page.risks; },
		noExists() { return this.page.noExists; },
		comparing() { return this.page.comparing; }
	},
	methods: {
		three,
		unitOf,
		show,
		posSpan,
		isPending(p) { return this.page.isPending(p); },
		invalidCurrent(p) { return this.page.invalidCurrent(p); },
		invalidEdited(p) { return this.page.invalidEdited(p); },
		differentOfFactory(p) { return this.page.differentOfFactory(p); },
		differentOfBackup(p) { return this.page.differentOfBackup(p); },
		valueBackup(p) { return this.page.valueBackup(p); },
		valueFor(p) { return this.page.valueFor(p); },
		chooseLabel(id) { this.page.chooseLabel(id); },
		edit(p, v) { this.page.edit(p, v); },
		choose(p, v) { this.page.choose(p, v); },
		tp(key, params) {
			return i18n.t('plugins.WorkshopRS485.paramsT3d.' + key, params);
		},
		modeUsed(p) {
			return modeUsed(p, this.page.modeServo);
		},
		textMode(m) {
			return textMode(m, this.tp);
		},
		iconGroup(p) {
			const g = this.page.groupsAll.find(x => x.id === p.group);
			return (g && g.icon) || this.page.iconsGroup[p.group] || 'mdi-cog';
		},
		labelsOf(p) {
			return (p.labels || []).filter(id => this.page.labels[id]).map(id => ({ id, ...this.page.labels[id] }));
		},
		// What a value means: option, DI/DO function or nothing
		meaning(p, v) {
			if (v == null || Number.isNaN(v)) {
				return '';
			}
			const op = textOption(p, v);
			if (op) {
				return op;
			}
			const table = p.record >= 100 && p.record <= 105 ? this.page.functionsDi : (p.record >= 108 && p.record <= 111 ? this.page.functionsDo : null);
			if (table) {
				const f = table[Math.abs(v)];
				return f ? f + (v < 0 ? ' ' + this.tp('inverted_logic') : '') : this.tp('undocumented_function');
			}
			return '';
		}
	}
};
</script>

<style scoped>
.pt3-param {
	padding: 12px 14px;
	border-radius: 10px;
	background: rgba(128, 128, 128, 0.06);
	border-left: 3px solid transparent;
	margin-bottom: 8px;
}
.pt3-param.inactive {
	opacity: 0.6;
}
.pt3-cab {
	display: flex;
	align-items: flex-start;
	gap: 10px;
}
.pt3-icon {
	flex: 0 0 auto;
	width: 34px;
	height: 34px;
	border-radius: 50%;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(128, 128, 128, 0.18);
	border: 2px solid transparent;
}
.pt3-icon.risk-low {
	border-color: rgba(102, 187, 106, 0.6);
}
.pt3-icon.risk-medium {
	border-color: rgba(255, 167, 38, 0.7);
}
.pt3-icon.risk-high {
	border-color: rgba(239, 83, 80, 0.8);
}
.pt3-title {
	flex: 1 1 auto;
	min-width: 0;
}
.pt3-labels {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
	margin-top: 4px;
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
.pt3-that-does {
	margin: 8px 0 0 44px;
	font-size: 14px;
	line-height: 1.4;
}
.pt3-note {
	margin: 4px 0 0 44px;
	font-size: 12px;
	color: var(--tp-blue-bright, #90caf9);
}
.pt3-body-param {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	margin: 10px 0 0 44px;
}
.pt3-box {
	flex: 0 1 180px;
	min-width: 150px;
	padding: 8px 10px;
	border-radius: 8px;
	background: rgba(128, 128, 128, 0.08);
}
.pt3-box-wide {
	flex: 1 1 280px;
}
.pt3-meaning {
	font-size: 12px;
	color: var(--tp-green-bright, #a5d6a7);
}
.pt3-buttons {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
}
.pt3-button {
	padding: 3px 8px;
	border-radius: 6px;
	border: 1px solid rgba(128, 128, 128, 0.4);
	font-size: 12px;
	color: inherit;
	background: transparent;
	cursor: pointer;
}
.pt3-button:hover:not(:disabled) {
	background: rgba(128, 128, 128, 0.1);
}
.pt3-button.current {
	border-color: #66bb6a;
	background: rgba(128, 128, 128, 0.1);
	font-weight: 600;
}
.pt3-button.chosen {
	border-color: #2196f3;
	background: rgba(128, 128, 128, 0.1);
}
.pt3-span {
	display: flex;
	align-items: center;
	gap: 6px;
	font-size: 12px;
	font-variant-numeric: tabular-nums;
}
/* the track of the range bar: the marks (current, factory, new) are placed against it, so it must be the positioned one (this rule was left in ParamsT3d when the card was split out, and the marks floated loose over the page) */
.pt3-bar-span {
	position: relative;
	flex: 1 1 auto;
	height: 6px;
	border-radius: 3px;
	background: linear-gradient(90deg, rgba(128, 128, 128, 0.25), rgba(128, 128, 128, 0.45));
}
.pt3-mark-current,
.pt3-mark-factory,
.pt3-mark-new {
	position: absolute;
	top: 50%;
	transform: translate(-50%, -50%);
	border-radius: 50%;
}
.pt3-mark-current {
	width: 12px;
	height: 12px;
	background: #66bb6a;
	border: 2px solid #1e1e1e;
	z-index: 2;
}
.pt3-mark-current.outside {
	background: #ef5350;
}
.pt3-mark-factory {
	width: 4px;
	height: 14px;
	border-radius: 2px;
	background: #ffca28;
	z-index: 1;
}
.pt3-mark-new {
	width: 12px;
	height: 12px;
	background: transparent;
	border: 2px solid #2196f3;
	z-index: 3;
}
.pt3-factory {
	font-size: 12px;
	margin-top: 6px;
}
.pt3-param.pending {
	border-left-color: #2196f3;
	background: rgba(128, 128, 128, 0.1);
}
.pt3-param.written {
	border-left-color: #ffa726;
}
.pt3-param.invalido {
	border-left-color: #ef5350;
}
.pt3-num {
	font-family: monospace;
	font-size: 12px;
	padding: 1px 6px;
	border-radius: 4px;
	background: rgba(128, 128, 128, 0.2);
}
.pt3-mode {
	display: inline-flex;
	align-items: center;
	gap: 2px;
	font-size: 11px;
	padding: 0 6px;
	border-radius: 10px;
	border: 1px solid rgba(128, 128, 128, 0.5);
	color: var(--tp-faint, #9e9e9e);
}
.pt3-mode.used {
	border-color: #66bb6a;
	color: #66bb6a;
}
.pt3-original {
	margin: 8px 0 0 44px;
	font-size: 11px;
	color: var(--tp-faint, #9e9e9e);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
@media (max-width: 700px) {
	.pt3-that-does,
	.pt3-note,
	.pt3-body-param,
	.pt3-original {
		margin-left: 0;
	}
}
.pt3-label {
	font-size: 11px;
	color: var(--tp-faint, #9e9e9e);
	margin-bottom: 2px;
}
.pt3-current {
	font-size: 18px;
	font-weight: 500;
	font-variant-numeric: tabular-nums;
	line-height: 1.2;
}
.pt3-current small {
	font-size: 12px;
	color: var(--tp-faint, #9e9e9e);
}
.pt3-input {
	width: 120px;
	padding: 6px 8px;
	border: 1px solid rgba(128, 128, 128, 0.45);
	border-radius: 4px;
	color: inherit;
	background: transparent;
	font-size: 14px;
}
.pt3-input.outside {
	border-color: #ef5350;
}
</style>
