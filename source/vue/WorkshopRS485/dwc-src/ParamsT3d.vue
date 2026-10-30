<template>
	<div class="pt3">
		<!-- barra superior -->
		<div class="pt3-bar">
			<div class="pt3-summary">
				<template v-if="reading">
					<v-progress-circular :model-value="progress" size="18" width="2" color="primary" class="mr-2" />
					{{ $t('plugins.WorkshopRS485.paramsT3d.reading_from_servo', { n: readN, total: TOTAL }) }}
				</template>
				<template v-else-if="hasReading">
					<v-icon size="small" :color="errors ? 'warning' : 'success'" class="mr-1">{{ errors ? 'mdi-alert' : 'mdi-check-circle' }}</v-icon>
					{{ $t('plugins.WorkshopRS485.paramsT3d.documented_internal_read', { doc: counts.documented, internal: counts.internal }) }}
					<span v-if="errors" class="text-warning ml-1">&middot; {{ $t('plugins.WorkshopRS485.paramsT3d.n_no_response', { n: errors }) }}</span>
					<span v-if="hourReading" class="text-medium-emphasis ml-1">&middot; {{ hourReading }}</span>
				</template>
			</div>
			<v-spacer />
			<v-text-field v-model="filter" prepend-inner-icon="mdi-magnify" :placeholder="$t('plugins.WorkshopRS485.paramsT3d.search_number_name_or_word_e')" density="compact" variant="outlined" hide-details clearable class="pt3-search" />
			<v-btn size="small" variant="outlined" :loading="reading" @click="readTodo()"><v-icon size="small" start>mdi-refresh</v-icon>{{ $t('plugins.WorkshopRS485.paramsT3d.read_all_again') }}</v-btn>
			<v-menu v-model="menuBackup" location="bottom end" :close-on-content-click="false" max-width="440">
				<template #activator="{ props: act }">
					<v-btn size="small" variant="outlined" v-bind="act" @click="loadBackups()"><v-icon size="small" start>mdi-content-save-cog</v-icon>{{ $t('plugins.WorkshopRS485.paramsT3d.backups') }}</v-btn>
				</template>
				<v-card class="pa-3">
					<div class="text-title-small">{{ $t('plugins.WorkshopRS485.paramsT3d.save_what_was_read_to_the') }}</div>
					<div class="d-flex align-center mt-1" style="gap:6px">
						<v-text-field v-model.trim="noteBackup" :placeholder="$t('plugins.WorkshopRS485.paramsT3d.note_optional_e_g_before_tuning')" density="compact" variant="outlined" hide-details />
						<v-btn size="small" color="primary" :disabled="!hasReading || reading || !can('rs485.backup_save')" :loading="savingBackup" @click="saveBackup()">{{ $t('plugins.WorkshopRS485.common.save') }}</v-btn>
					</div>
					<div class="text-title-small mt-3">{{ $t('plugins.WorkshopRS485.paramsT3d.on_the_sd') }} <span class="text-medium-emphasis text-body-small">(sys/workshop/data/rs485-backups/)</span></div>
					<div v-if="!backups.length" class="text-body-small text-medium-emphasis">{{ $t('plugins.WorkshopRS485.paramsT3d.there_are_no_backups_of_this') }}</div>
					<div v-for="r in backups" :key="r.name" class="pt3-backup">
						<div class="pt3-backup-name">
							<div class="text-body-medium">{{ (r.date || '').replace('T', ' ') }}<span v-if="r.note" class="text-medium-emphasis"> &middot; {{ r.note }}</span></div>
							<div class="text-body-small text-medium-emphasis">{{ r.error ? r.error : $t('plugins.WorkshopRS485.paramsT3d.n_registers', { n: r.amount }) }}</div>
						</div>
						<v-btn size="x-small" variant="text" :disabled="!!r.error" @click="compareWith(r)">{{ $t('plugins.WorkshopRS485.paramsT3d.compare') }}</v-btn>
						<v-btn size="x-small" variant="text" :disabled="!!r.error" @click="restore(r)">{{ $t('plugins.WorkshopRS485.paramsT3d.restore') }}</v-btn>
						<v-btn :aria-label="$t('plugins.WorkshopRS485.shared.aria_delete')" size="x-small" icon :disabled="!can('rs485.backup_delete')" :color="armedDelete === r.name ? 'error' : ''" @click="touchDeleteBackup(r)"><v-icon size="x-small">mdi-delete</v-icon></v-btn>
					</div>
					<v-divider class="my-2" />
					<div class="d-flex flex-wrap" style="gap:6px">
						<v-btn size="x-small" variant="text" :disabled="!hasReading" @click="downloadBackup()"><v-icon size="x-small" start>mdi-download</v-icon>{{ $t('plugins.WorkshopRS485.paramsT3d.download_json') }}</v-btn>
						<v-btn size="x-small" variant="text" @click="file.click()"><v-icon size="x-small" start>mdi-upload</v-icon>{{ $t('plugins.WorkshopRS485.paramsT3d.load_json_as_changes') }}</v-btn>
					</div>
				</v-card>
			</v-menu>
			<input ref="file" type="file" accept=".json,application/json" style="display:none" @change="loadFile">
		</div>
		<div v-if="msg" class="text-body-medium mt-2" :class="msgError ? 'text-error' : 'text-success'">{{ msg }}</div>

		<!-- filtros y comparacion -->
		<div v-if="hasReading" class="d-flex align-center flex-wrap mt-2" style="gap:6px">
			<v-chip-group v-model="view" mandatory active-class="text-primary" class="pt3-views">
				<v-chip size="small" filter value="all">{{ $t('plugins.WorkshopRS485.common.all') }}</v-chip>
				<v-chip size="small" filter value="different">{{ $t('plugins.WorkshopRS485.paramsT3d.different_from_factory_n', { n: counts.different }) }}</v-chip>
				<v-chip size="small" filter value="invalid" :color="counts.invalid ? 'error' : ''">{{ $t('plugins.WorkshopRS485.paramsT3d.invalid_n', { n: counts.invalid }) }}</v-chip>
				<v-chip v-if="comparing" size="small" filter value="backup">{{ $t('plugins.WorkshopRS485.paramsT3d.different_from_backup_n', { n: counts.vsBackup }) }}</v-chip>
			</v-chip-group>
			<!-- Labels: compact panel that closes when one is chosen (2026-10-10).
			     The filter goes in its own variable: before it was saved in "vista",
			     and the "mandatory" chip-group sent it back to "All" instantly. -->
			<v-menu v-model="menuLabels" max-width="320" max-height="60vh">
				<template #activator="{ props: act }">
					<v-btn size="x-small" variant="text" v-bind="act"><v-icon size="x-small" start>mdi-tag-multiple</v-icon>{{ labelFilter ? labels[labelFilter].text : $t('plugins.WorkshopRS485.paramsT3d.filter_by_tag') }}</v-btn>
				</template>
				<v-card class="pa-2 pt3-menu-labels">
					<div class="text-body-small text-medium-emphasis mb-1">{{ $t('plugins.WorkshopRS485.paramsT3d.tap_a_tag_to_filter') }}</div>
					<div class="d-flex flex-wrap" style="gap:4px">
						<span
							v-for="(e, id) in labels" :key="id" class="pt3-label" :class="[bgClass(e.color), { 'pt3-label-sel': labelFilter === id }]"
							:title="e.help" @click="chooseLabel(id)"
						><v-icon size="x-small">{{ e.icon }}</v-icon>{{ e.text }} <b class="ml-1">{{ countLabel(id) }}</b></span>
					</div>
					<div class="text-body-small text-medium-emphasis mt-2 mb-1">{{ $t('plugins.WorkshopRS485.paramsT3d.risk_of_changing_it') }}</div>
					<div class="d-flex flex-wrap" style="gap:2px 10px">
						<span v-for="(r, id) in risks" :key="id" class="text-body-small d-inline-flex align-center" :title="r.text">
							<v-icon size="x-small" :color="r.color" class="mr-1">{{ r.icon }}</v-icon>{{ r.text }}
						</span>
					</div>
				</v-card>
			</v-menu>
			<v-chip v-if="labelFilter" size="small" closable @click:close="labelSel = null" :color="vcolor(labels[labelFilter].color)" variant="flat">
				<v-icon size="x-small" start>{{ labels[labelFilter].icon }}</v-icon>{{ labels[labelFilter].text }}
			</v-chip>
			<v-spacer />
			<template v-if="comparing">
				<v-chip size="small" color="primary" variant="flat" closable @click:close="comparing = null">
					<v-icon size="x-small" start>mdi-compare</v-icon>{{ $t('plugins.WorkshopRS485.paramsT3d.comparing_with_backup', { date: (comparing.date || '').replace('T', ' ') }) }}
				</v-chip>
			</template>
		</div>

		<div class="pt3-body">
			<!-- grupos -->
			<div class="pt3-groups">
				<button v-for="g in groupsVisible" :key="g.id" type="button" class="pt3-group" :class="{ active: group === g.id && !filterActive }" @click="group = g.id; filter = ''; view = 'all'; labelSel = null">
					<span class="pt3-group-name"><v-icon size="small" class="mr-1">{{ g.icon || iconsGroup[g.id] || 'mdi-cog' }}</v-icon>{{ g.name }}</span>
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
					<div class="text-title-medium font-weight-medium">{{ groupCurrent.name }}</div>
					<div class="text-body-medium text-medium-emphasis">{{ groupCurrent.description }}</div>
					<v-alert v-if="group === 'communication'" density="compact" variant="tonal" type="warning" class="mt-2 mb-0">
						{{ $t('plugins.WorkshopRS485.paramsT3d.if_you_change_the_address_baud') }}
					</v-alert>
					<v-alert v-if="group === 'internal_factory'" density="compact" variant="tonal" type="info" class="mt-2 mb-0">
						{{ $t('plugins.WorkshopRS485.paramsT3d.internal_registers_note', { manual }) }}
					</v-alert>
				</div>
				<div v-else-if="filterActive" class="text-body-medium text-medium-emphasis mb-2">{{ $t('plugins.WorkshopRS485.paramsT3d.n_parameters', { n: visible.length }) }}</div>

				<div v-for="p in visible" :key="p.record" class="pt3-param" :class="{ pending: isPending(p), written: written[p.record], invalido: !!invalidCurrent(p), inactive: !modeUsed(p) }">
					<!-- cabecera: icono, numero, nombre, etiquetas, riesgo -->
					<div class="pt3-cab">
						<div class="pt3-icon" :class="'risk-' + (p.risk || 'low')">
							<v-icon size="small">{{ iconGroup(p) }}</v-icon>
						</div>
						<div class="pt3-title">
							<div class="d-flex align-center flex-wrap" style="gap:6px">
								<span class="pt3-num">P-{{ three(p.record) }}</span>
								<span class="text-body-large font-weight-medium">{{ p.name }}</span>
								<v-tooltip v-if="p.risk && risks[p.risk]" location="bottom">
									<template #activator="{ props: act }">
										<v-icon size="small" :color="risks[p.risk].color" v-bind="act">{{ risks[p.risk].icon }}</v-icon>
									</template>
									{{ risks[p.risk].text }}
								</v-tooltip>
								<v-chip v-if="written[p.record]" size="x-small" color="warning" variant="flat"><v-icon size="x-small" start>mdi-content-save-alert</v-icon>{{ $t('plugins.WorkshopRS485.paramsT3d.written_not_in_eeprom') }}</v-chip>
								<v-chip v-if="differentOfFactory(p)" size="x-small" color="amber-darken-2" variant="flat"><v-icon size="x-small" start>mdi-pencil</v-icon>{{ $t('plugins.WorkshopRS485.paramsT3d.changed') }}</v-chip>
							</div>
							<div class="pt3-labels">
								<v-tooltip v-for="e in labelsOf(p)" :key="e.id" location="bottom" max-width="280">
									<template #activator="{ props: act }">
										<span class="pt3-label" :class="bgClass(e.color)" v-bind="act" @click="chooseLabel(e.id)"><v-icon size="x-small">{{ e.icon }}</v-icon>{{ e.text }}</span>
									</template>
									{{ e.help }}
								</v-tooltip>
								<v-tooltip v-if="p.kind === 'doc' && p.mode" location="bottom">
									<template #activator="{ props: act }">
										<span class="pt3-mode" :class="{ used: modeUsed(p) }" v-bind="act"><v-icon size="x-small">{{ modeUsed(p) ? 'mdi-check' : 'mdi-minus' }}</v-icon>{{ $t('plugins.WorkshopRS485.paramsT3d.mode_n', { mode: p.mode }) }}</span>
									</template>
									{{ modeUsed(p) ? $t('plugins.WorkshopRS485.paramsT3d.has_effect_in_mode') : $t('plugins.WorkshopRS485.paramsT3d.no_effect_in_mode', { modes: textMode(p.mode) }) }}
								</v-tooltip>
							</div>
						</div>
					</div>

					<!-- que hace -->
					<div v-if="p.that_does" class="pt3-that-does">{{ p.that_does }}</div>
					<div v-if="p.note && p.note !== p.that_does" class="pt3-note"><v-icon size="x-small" color="info" class="mr-1">mdi-lightbulb-on-outline</v-icon>{{ p.note }}</div>
					<div v-if="invalidCurrent(p)" class="text-body-small text-error mt-1"><v-icon size="x-small" color="error">mdi-alert</v-icon> {{ $t('plugins.WorkshopRS485.paramsT3d.current_value_invalid', { why: invalidCurrent(p) }) }}</div>

					<!-- valor / permitido / cambiar -->
					<div class="pt3-body-param">
						<div class="pt3-box">
							<div class="pt3-label"><v-icon size="x-small">mdi-chip</v-icon> {{ $t('plugins.WorkshopRS485.paramsT3d.on_the_servo') }}</div>
							<div v-if="values[p.record] && values[p.record].error" class="text-warning text-body-medium" :title="values[p.record].error">{{ $t('plugins.WorkshopRS485.common.no_response') }}</div>
							<div v-else-if="values[p.record] && values[p.record].value === noExists" class="text-medium-emphasis text-body-medium" :title="$t('plugins.WorkshopRS485.paramsT3d.the_servo_answers_0x5a53_it_does')">{{ $t('plugins.WorkshopRS485.paramsT3d.does_not_report_it') }}</div>
							<template v-else-if="values[p.record]">
								<div class="pt3-current">{{ show(p, values[p.record].value) }}<small v-if="unitOf(p)"> {{ unitOf(p) }}</small></div>
								<div v-if="meaning(p, values[p.record].value)" class="pt3-meaning">{{ meaning(p, values[p.record].value) }}</div>
								<div v-if="p.scale && p.scale !== 1" class="text-body-small text-medium-emphasis">{{ $t('plugins.WorkshopRS485.paramsT3d.stored_value', { v: values[p.record].value }) }}</div>
							</template>
							<div v-else class="text-medium-emphasis">&mdash;</div>
						</div>

						<div v-if="p.kind === 'doc'" class="pt3-box pt3-box-wide">
							<div class="pt3-label"><v-icon size="x-small">mdi-arrow-expand-horizontal</v-icon> {{ $t('plugins.WorkshopRS485.paramsT3d.allowed') }}</div>
							<div v-if="p.options.length" class="pt3-buttons">
								<button v-for="o in p.options" :key="o.value" type="button" class="pt3-button" :disabled="p.only_reading"
									:class="{ current: valueFor(p) === o.value, chosen: edited[p.record] != null && Number(edited[p.record]) === o.value }"
									:title="p.defaultValue === o.value ? $t('plugins.WorkshopRS485.paramsT3d.factory_value') : ''" @click="choose(p, o.value)">
									<b>{{ o.value }}</b> {{ o.text }}<v-icon v-if="p.defaultValue === o.value" size="x-small" class="ml-1">mdi-factory</v-icon>
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
									<small v-if="unitOf(p)" class="text-medium-emphasis">{{ unitOf(p) }}</small>
								</div>
								<div v-if="p.digits.length" class="text-body-small text-medium-emphasis"><v-icon size="x-small">mdi-numeric</v-icon> {{ $t('plugins.WorkshopRS485.paramsT3d.by_digits', { max: p.digits[0].max }) }}</div>
							</template>
							<div class="pt3-factory">
								<v-icon size="x-small">mdi-factory</v-icon> {{ $t('plugins.WorkshopRS485.paramsT3d.factory_colon') }}
								<b v-if="p.defaultValue != null">{{ show(p, p.defaultValue) }}<span v-if="meaning(p, p.defaultValue)" class="font-weight-regular"> &middot; {{ meaning(p, p.defaultValue) }}</span></b>
								<span v-else class="text-medium-emphasis">{{ p.of_motor ? $t('plugins.WorkshopRS485.paramsT3d.depends_on_motor') : $t('plugins.WorkshopRS485.paramsT3d.depends_on_drive') }}</span>
							</div>
							<div v-if="comparing" class="pt3-factory" :class="{ 'text-purple-lighten-2 font-weight-bold': differentOfBackup(p) }">
								<v-icon size="x-small">mdi-compare</v-icon> {{ $t('plugins.WorkshopRS485.paramsT3d.in_backup_value', { v: valueBackup(p) == null ? '—' : show(p, valueBackup(p)) }) }}
							</div>
						</div>
						<div v-else-if="comparing" class="pt3-box">
							<div class="pt3-label"><v-icon size="x-small">mdi-compare</v-icon> {{ $t('plugins.WorkshopRS485.paramsT3d.in_the_backup') }}</div>
							<div class="text-body-medium" :class="{ 'text-purple-lighten-2 font-weight-bold': differentOfBackup(p) }">{{ valueBackup(p) == null ? '—' : valueBackup(p) }}</div>
						</div>

						<div v-if="p.kind === 'doc' && !p.only_reading" class="pt3-box">
							<div class="pt3-label"><v-icon size="x-small">mdi-pencil</v-icon> {{ $t('plugins.WorkshopRS485.paramsT3d.change_to') }}<span v-if="p.scale && p.scale !== 1"> {{ $t('plugins.WorkshopRS485.paramsT3d.saved_value') }}</span></div>
							<template v-if="!p.options.length">
								<div class="d-flex align-center" style="gap:4px">
									<input :value="edited[p.record]" type="number" :min="p.min" :max="p.max" class="pt3-input" :class="{ outside: invalidEdited(p) }"
										:placeholder="valueFor(p) != null ? String(valueFor(p)) : ''" @input="e => edit(p, e.target.value)">
									<v-btn :aria-label="$t('plugins.WorkshopRS485.shared.aria_close')" v-if="edited[p.record] != null" size="x-small" icon @click="edit(p, null)"><v-icon size="x-small">mdi-close</v-icon></v-btn>
								</div>
								<div v-if="edited[p.record] != null && meaning(p, Number(edited[p.record]))" class="text-body-small">= {{ meaning(p, Number(edited[p.record])) }}</div>
							</template>
							<div v-else class="text-body-small text-medium-emphasis">
								{{ edited[p.record] != null ? $t('plugins.WorkshopRS485.paramsT3d.new_value', { v: edited[p.record] }) : $t('plugins.WorkshopRS485.paramsT3d.tap_an_option') }}
								<v-btn :aria-label="$t('plugins.WorkshopRS485.shared.aria_close')" v-if="edited[p.record] != null" size="x-small" icon @click="edit(p, null)"><v-icon size="x-small">mdi-close</v-icon></v-btn>
							</div>
							<div v-if="invalidEdited(p)" class="text-body-small text-error">{{ invalidEdited(p) }}</div>
							<v-btn v-else-if="differentOfFactory(p)" size="x-small" variant="text" color="amber" class="px-0 mt-1" @click="edit(p, p.defaultValue)"><v-icon size="x-small" start>mdi-backup-restore</v-icon>{{ $t('plugins.WorkshopRS485.paramsT3d.back_to_factory') }}</v-btn>
						</div>
					</div>

					<div v-if="p.description" class="pt3-original"><v-icon size="x-small">mdi-book-open-variant</v-icon> {{ $t('plugins.WorkshopRS485.paramsT3d.manual_text', { text: p.description }) }}</div>
				</div>
				<div v-if="!visible.length && table.length" class="text-body-medium text-medium-emphasis pa-4">{{ $t('plugins.WorkshopRS485.paramsT3d.nothing_to_show_with_this_filter') }}</div>
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
				<v-checkbox v-if="hasInvalid && atLeast('admin')" v-model="force" density="compact" hide-details class="mt-0 mr-3" :label="$t('plugins.WorkshopRS485.paramsT3d.force_invalid_values')" color="error" />
				<v-btn size="small" variant="text" @click="discard()">{{ $t('plugins.WorkshopRS485.common.discard') }}</v-btn>
				<v-btn size="small" color="primary" :loading="writing" :disabled="(hasInvalid && !force) || !can('rs485.action', { action: 'write_param', data: { force } })" @click="writeTodo()">
					<v-icon size="small" start>mdi-upload</v-icon>{{ $t('plugins.WorkshopRS485.paramsT3d.write_to_the_servo') }}
				</v-btn>
			</template>
			<template v-else>
				<div class="pt3-changes-list">
					<v-icon size="small" color="warning" class="mr-1">mdi-alert</v-icon>
					{{ $t('plugins.WorkshopRS485.paramsT3d.n_written_but', { n: pendingEeprom }) }} <b>{{ $t('plugins.WorkshopRS485.paramsT3d.not_saved') }}</b>{{ $t('plugins.WorkshopRS485.paramsT3d.they_re_lost_when_the_servo') }}
				</div>
				<v-btn size="small" :color="armed ? 'error' : 'primary'" :loading="savingEeprom" :disabled="!can('rs485.action', { action: 'save_eeprom' })" @click="touchEeprom()">
					<v-icon size="small" start>mdi-content-save</v-icon>{{ armed ? $t('plugins.WorkshopRS485.paramsT3d.tap_again_store_in_the_servo') : $t('plugins.WorkshopRS485.paramsT3d.save_to_eeprom') }}
				</v-btn>
			</template>
		</div>
	</div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { i18n } from './dwc-host.js'
import { action, info, callService, useCan } from './api.js'
import { PARAMS_CACHE as CACHE } from './params-cache.js'

// The drive has registers 0-255 (P-000 to P-255). One that does not exist returns
// NO_EXISTE (0x5A53); the others not in the manual are factory ones.
const TOTAL = 256
const BY_READING = 16
const format = 'workshop-t3d-params-v1'

const modes = () => ({ P: i18n.t('plugins.WorkshopRS485.paramsT3d.mode_position'), S: i18n.t('plugins.WorkshopRS485.paramsT3d.mode_speed'), T: i18n.t('plugins.WorkshopRS485.paramsT3d.mode_torque'), ALL: i18n.t('plugins.WorkshopRS485.paramsT3d.mode_all') })

const props = defineProps({
	dispId: { type: String, required: true }
})

const { can, atLeast } = useCan()
const c = CACHE[props.dispId] || {}

const table = ref([])
const groups = ref([])
const partial = ref([])
const noExists = ref(0x5A53)
const manual = ref('')
const group = ref('mode')
const filter = ref('')
const view = ref('all')
const labelSel = ref(null) // filter by label (apart from "view")
const menuLabels = ref(false)
const values = ref(c.values || {})
const hourReading = ref(c.hour || null)
const edited = ref({})
const written = ref(c.written || {})
const reading = ref(false)
const readN = ref(0)
const writing = ref(false)
const force = ref(false)
const armed = ref(false)
let armedTimer = null
const savingEeprom = ref(false)
const menuBackup = ref(false)
const backups = ref([])
const noteBackup = ref('')
const savingBackup = ref(false)
const armedDelete = ref(null)
const comparing = ref(c.comparing || null)
const labels = ref({})
const risks = ref({})
const iconsGroup = ref({})
const functionsDi = ref({})
const functionsDo = ref({})
const msg = ref(null)
const msgError = ref(false)
const file = ref(null)

// Vuetify 2 class names sent by the backend ("cyan darken-1") -> Vuetify 4 ("cyan-darken-1")
function vcolor(col) {
	return String(col || '').trim().replace(/\s+/g, '-')
}
function bgClass(col) {
	return 'bg-' + vcolor(col)
}

// P-004: 0 = position (normal with the Duet), 1 = speed, 2 = torque, 3-5 mixed
const modeServo = computed(() => {
	const v = values.value[4]
	return v && !v.error ? v.value : null
})
// All the rows: documented + partially documented + internal ones read
const rows = computed(() => {
	const doc = table.value.map(p => ({ ...p, kind: 'doc' }))
	const known = new Set(doc.map(p => p.record))
	const parc = partial.value.filter(p => !known.has(p.record)).map(p => ({
		record: p.record, name: p.name, kind: 'partial', group: 'internal_factory', options: [], digits: [], description: '', note: i18n.t('plugins.WorkshopRS485.paramsT3d.mentioned_in_the_manual_text_no')
	}))
	parc.forEach(p => known.add(p.record))
	const internal = []
	for (let r = 0; r < TOTAL; r++) {
		const v = values.value[r]
		if (!known.has(r) && v && (v.error || v.value !== noExists.value)) {
			internal.push({ record: r, name: i18n.t('plugins.WorkshopRS485.paramsT3d.factory_internal_undocumented'), kind: 'internal', group: 'internal_factory', options: [], digits: [], description: '', note: '' })
		}
	}
	return [...doc, ...parc, ...internal].sort((a, b) => a.record - b.record)
})
const groupsAll = computed(() => [...groups.value, { id: 'internal_factory', name: i18n.t('plugins.WorkshopRS485.paramsT3d.factory_internals'), description: i18n.t('plugins.WorkshopRS485.paramsT3d.undocumented_registers_read_only') }])
const groupsVisible = computed(() => groupsAll.value.map(g => ({ ...g, count: rows.value.filter(p => p.group === g.id).length })).filter(g => g.count))
const groupCurrent = computed(() => groupsAll.value.find(g => g.id === group.value))
const labelFilter = computed(() => labelSel.value && labels.value[labelSel.value] ? labelSel.value : null)
const filterActive = computed(() => !!(filter.value || '').trim() || view.value !== 'all' || !!labelFilter.value)
const visible = computed(() => {
	let list = rows.value
	const f = (filter.value || '').trim().toLowerCase()
	if (view.value === 'different') {
		list = list.filter(p => differentOfFactory(p))
	} else if (view.value === 'invalid') {
		list = list.filter(p => invalidCurrent(p))
	} else if (view.value === 'backup') {
		list = list.filter(p => differentOfBackup(p))
	}
	// the label is combined with the other filters
	if (labelFilter.value) {
		list = list.filter(p => (p.labels || []).includes(labelFilter.value))
	}
	if (!f && view.value === 'all' && !labelFilter.value) {
		return list.filter(p => p.group === group.value)
	}
	if (f) {
		const num = f.replace(/^p-?0*/, '') || '0'
		list = list.filter(p => String(p.record) === num || p.name.toLowerCase().includes(f) ||
			(p.description || '').toLowerCase().includes(f) || (p.note || '').toLowerCase().includes(f))
	}
	return list
})
const hasReading = computed(() => Object.keys(values.value).length > 0)
const errors = computed(() => Object.values(values.value).filter(v => v.error).length)
const counts = computed(() => {
	const r = rows.value
	return {
		documented: r.filter(p => p.kind === 'doc' && values.value[p.record] && !values.value[p.record].error).length,
		internal: r.filter(p => p.kind !== 'doc').length,
		different: r.filter(p => differentOfFactory(p)).length,
		invalid: r.filter(p => invalidCurrent(p)).length,
		vsBackup: comparing.value ? r.filter(p => differentOfBackup(p)).length : 0
	}
})
const progress = computed(() => readN.value / TOTAL * 100)
const pending = computed(() => rows.value.filter(p => isPending(p)).map(p => ({
	p, newItem: Number(edited.value[p.record]),
	before: values.value[p.record] && !values.value[p.record].error ? values.value[p.record].value : '?'
})))
const hasInvalid = computed(() => pending.value.some(ch => invalidEdited(ch.p)))
const pendingEeprom = computed(() => Object.keys(written.value).length)

onMounted(async () => {
	try {
		const r = await info(props.dispId)
		table.value = r.params || []
		groups.value = r.groups || []
		partial.value = r.partial || []
		noExists.value = r.no_exists != null ? r.no_exists : noExists.value
		manual.value = r.manual || i18n.t('plugins.WorkshopRS485.paramsT3d.t3d_manual')
		const a = r.help || {}
		labels.value = a.labels || {}
		risks.value = a.risks || {}
		iconsGroup.value = a.icons_group || {}
		functionsDi.value = a.functions_di || {}
		functionsDo.value = a.functions_do || {}
	} catch (e) {
		msg.value = i18n.t('plugins.WorkshopRS485.paramsT3d.could_not_load_the_table') + (e.message || e)
		msgError.value = true
		return
	}
	if (!hasReading.value) {
		readTodo()
	}
})
onBeforeUnmount(() => {
	clearTimeout(armedTimer)
	CACHE[props.dispId] = { values: values.value, hour: hourReading.value, written: written.value, comparing: comparing.value }
})

function three(n) {
	return ('00' + n).slice(-3)
}
function textMode(m) {
	return m.split(',').map(x => modes()[x] || x).join(', ')
}
function modeUsed(p) {
	// the Duet controls the servo by pulses (position): P and ALL are the ones that matter
	if (!p.mode || modeServo.value == null) {
		return true
	}
	// 0 = position, 1 = speed, 2 = torque, 3-5 = mixed (two letters apply)
	const letters = { 0: ['P'], 1: ['S'], 2: ['T'], 3: ['P', 'S'], 4: ['P', 'T'], 5: ['S', 'T'] }[modeServo.value]
	return !letters || p.mode === 'ALL' || letters.some(l => p.mode.split(',').includes(l))
}
function iconGroup(p) {
	const g = groupsAll.value.find(x => x.id === p.group)
	return (g && g.icon) || iconsGroup.value[p.group] || 'mdi-cog'
}
function chooseLabel(id) {
	labelSel.value = labelSel.value === id ? null : id
	menuLabels.value = false
}
function labelsOf(p) {
	return (p.labels || []).filter(id => labels.value[id]).map(id => ({ id, ...labels.value[id] }))
}
function countLabel(id) {
	return rows.value.filter(p => (p.labels || []).includes(id)).length
}
function valueFor(p) {
	const v = values.value[p.record]
	return v && !v.error && v.value !== noExists.value ? v.value : null
}
// What a value means: option, DI/DO function or nothing
function meaning(p, v) {
	if (v == null || Number.isNaN(v)) {
		return ''
	}
	const op = textOption(p, v)
	if (op) {
		return op
	}
	const tbl = p.record >= 100 && p.record <= 105 ? functionsDi.value : (p.record >= 108 && p.record <= 111 ? functionsDo.value : null)
	if (tbl) {
		const f = tbl[Math.abs(v)]
		return f ? f + (v < 0 ? ' ' + i18n.t('plugins.WorkshopRS485.paramsT3d.inverted_logic') : '') : i18n.t('plugins.WorkshopRS485.paramsT3d.undocumented_function')
	}
	return ''
}
function posSpan(p, v) {
	const span = p.max - p.min
	return span > 0 ? Math.max(0, Math.min(100, (v - p.min) / span * 100)) : 50
}
function choose(p, v) {
	if (p.only_reading) {
		return
	}
	edit(p, valueFor(p) === v ? null : v)
}
function unitOf(p) {
	return p.unit_scale || p.unit || ''
}
function show(p, v) {
	if (v == null || v === '') {
		return v
	}
	return p.scale && p.scale !== 1 ? (Number(v) * p.scale).toFixed(1) : v
}
function textOption(p, v) {
	const o = (p.options || []).find(x => x.value === v)
	return o ? o.text : ''
}
// Same rule as the backend's t3d_params.validate()
function validate(p, n) {
	if (p.kind !== 'doc') {
		return null
	}
	if (!Number.isInteger(n)) {
		return i18n.t('plugins.WorkshopRS485.paramsT3d.must_be_a_whole_number')
	}
	if (n < p.min || n > p.max) {
		return i18n.t('plugins.WorkshopRS485.paramsT3d.out_of_range', { min: show(p, p.min), max: show(p, p.max) })
	}
	for (const d of p.digits || []) {
		const dig = Math.floor(Math.abs(n) / Math.pow(10, d.position)) % 10
		if (dig > d.max) {
			return i18n.t('plugins.WorkshopRS485.paramsT3d.invalid_digit', { d: dig, where: d.text.split(':')[0], max: d.max })
		}
	}
	return null
}
function invalidCurrent(p) {
	const v = values.value[p.record]
	return v && !v.error && v.value !== noExists.value ? validate(p, v.value) : null
}
function invalidEdited(p) {
	const v = edited.value[p.record]
	return v === null || v === undefined || v === '' ? null : validate(p, Number(v))
}
function differentOfFactory(p) {
	const v = values.value[p.record]
	return p.kind === 'doc' && p.defaultValue != null && v && !v.error && v.value !== noExists.value && v.value !== p.defaultValue
}
function valueBackup(p) {
	const r = comparing.value && comparing.value.params[p.record]
	return r == null ? null : r
}
function differentOfBackup(p) {
	const r = valueBackup(p)
	const v = values.value[p.record]
	return r != null && v && !v.error && v.value !== r
}
function isPending(p) {
	const v = edited.value[p.record]
	if (v === null || v === undefined || v === '') {
		return false
	}
	const current = values.value[p.record]
	return !current || current.error || Number(v) !== current.value
}
function pendingOf(groupId) {
	return rows.value.some(p => p.group === groupId && isPending(p))
}
function invalidOf(groupId) {
	return rows.value.some(p => p.group === groupId && invalidCurrent(p))
}
function edit(p, v) {
	if (v === null || v === undefined || v === '') {
		delete edited.value[p.record]
	} else {
		edited.value[p.record] = v
	}
}
function discard() {
	edited.value = {}
	force.value = false
}
async function readTodo() {
	reading.value = true
	readN.value = 0
	msg.value = null
	const nuevos = {}
	try {
		for (let i = 0; i < TOTAL; i += BY_READING) {
			const regs = Array.from({ length: Math.min(BY_READING, TOTAL - i) }, (_, k) => i + k)
			const r = await action(props.dispId, 'read_params', { records: regs })
			for (const v of r.values) {
				nuevos[v.record] = v.error ? { error: v.error } : { value: v.value }
			}
			readN.value = i + regs.length
		}
		values.value = nuevos
		const d = new Date()
		hourReading.value = i18n.t('plugins.WorkshopRS485.paramsT3d.read_at', { time: String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') })
	} catch (e) {
		msg.value = i18n.t('plugins.WorkshopRS485.paramsT3d.reading_stopped_check', { error: e.message || String(e) })
		msgError.value = true
		if (Object.keys(nuevos).length) {
			values.value = { ...values.value, ...nuevos }
		}
	} finally {
		reading.value = false
	}
}
async function writeTodo() {
	writing.value = true
	msg.value = null
	const lista = pending.value.slice()
	let ok = 0
	const faults = []
	for (const ch of lista) {
		try {
			const r = await action(props.dispId, 'write_param', { record: ch.p.record, value: ch.newItem, force: force.value })
			values.value[ch.p.record] = { value: r.value }
			written.value[ch.p.record] = true
			delete edited.value[ch.p.record]
			ok++
		} catch (e) {
			faults.push(`P-${three(ch.p.record)}: ${e.message || e}`)
		}
	}
	writing.value = false
	force.value = false
	if (faults.length) {
		msg.value = i18n.t('plugins.WorkshopRS485.paramsT3d.n_written_some_failed', { n: ok, list: faults.join(' | ') })
		msgError.value = true
	} else {
		msg.value = i18n.t('plugins.WorkshopRS485.paramsT3d.n_written_verified', { n: ok })
		msgError.value = false
	}
}
function touchEeprom() {
	if (!armed.value) {
		armed.value = true
		clearTimeout(armedTimer)
		armedTimer = setTimeout(() => { armed.value = false }, 4000)
		return
	}
	armed.value = false
	saveEeprom()
}
async function saveEeprom() {
	savingEeprom.value = true
	try {
		await action(props.dispId, 'save_eeprom')
		written.value = {}
		msg.value = i18n.t('plugins.WorkshopRS485.paramsT3d.saved_in_the_servo_eeprom_the')
		msgError.value = false
	} catch (e) {
		msg.value = i18n.t('plugins.WorkshopRS485.common.could_not_save') + (e.message || e)
		msgError.value = true
	} finally {
		savingEeprom.value = false
	}
}
// -- backups ---------------------------------------------------------
function dataBackup() {
	return {
		format: format,
		device: props.dispId,
		date: new Date().toISOString(),
		note: noteBackup.value || '',
		params: Object.fromEntries(Object.entries(values.value)
			.filter(([, v]) => !v.error && v.value !== noExists.value).map(([k, v]) => [k, v.value]))
	}
}
async function loadBackups() {
	try {
		const r = await callService({ P: 'backups', I: props.dispId })
		backups.value = r.backups || []
	} catch (e) {
		msg.value = i18n.t('plugins.WorkshopRS485.paramsT3d.could_not_list_the_backups') + (e.message || e)
		msgError.value = true
	}
}
async function saveBackup() {
	savingBackup.value = true
	try {
		const r = await callService({ P: 'backup_save', J: dataBackup() })
		msg.value = i18n.t('plugins.WorkshopRS485.paramsT3d.backup_saved_on_sd', { name: r.name })
		msgError.value = false
		noteBackup.value = ''
		await loadBackups()
	} catch (e) {
		msg.value = i18n.t('plugins.WorkshopRS485.paramsT3d.could_not_save_the_backup') + (e.message || e)
		msgError.value = true
	} finally {
		savingBackup.value = false
	}
}
async function readBackup(r) {
	const d = await callService({ P: 'backup_read', N: r.name })
	if (d.format !== format || !d.params) {
		throw new Error(i18n.t('plugins.WorkshopRS485.paramsT3d.is_not_a_t3d_parameter_backup'))
	}
	return d
}
async function compareWith(r) {
	try {
		comparing.value = await readBackup(r)
		view.value = 'backup'
		menuBackup.value = false
	} catch (e) {
		msg.value = i18n.t('plugins.WorkshopRS485.paramsT3d.could_not_read_the_backup') + (e.message || e)
		msgError.value = true
	}
}
async function restore(r) {
	try {
		applyAsChanges(await readBackup(r))
		menuBackup.value = false
	} catch (e) {
		msg.value = i18n.t('plugins.WorkshopRS485.paramsT3d.could_not_read_the_backup') + (e.message || e)
		msgError.value = true
	}
}
function touchDeleteBackup(r) {
	if (armedDelete.value !== r.name) {
		armedDelete.value = r.name
		clearTimeout(armedTimer)
		armedTimer = setTimeout(() => { armedDelete.value = null }, 4000)
		return
	}
	armedDelete.value = null
	callService({ P: 'backup_delete', N: r.name }).then(() => loadBackups()).catch(e => {
		msg.value = i18n.t('plugins.WorkshopRS485.paramsT3d.could_not_delete', { error: e.message || String(e) })
		msgError.value = true
	})
}
// Only the documented and writable parameters go to "changes"; the
// factory internal ones stay in the backup as a reference.
function applyAsChanges(d) {
	let n = 0
	for (const [k, v] of Object.entries(d.params)) {
		const reg = Number(k)
		const p = rows.value.find(x => x.record === reg)
		const current = values.value[reg]
		if (p && p.kind === 'doc' && !p.only_reading && (!current || current.error || current.value !== v)) {
			edited.value[reg] = v
			n++
		}
	}
	msg.value = n ? i18n.t('plugins.WorkshopRS485.paramsT3d.backup_values_as_changes', { date: String(d.date || '').slice(0, 10), n })
		: i18n.t('plugins.WorkshopRS485.paramsT3d.the_backup_matches_what_the_servo')
	msgError.value = false
	filter.value = ''
}
function downloadBackup() {
	const data = dataBackup()
	const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
	const a = document.createElement('a')
	a.href = url
	a.download = `servo-${props.dispId}-${data.date.slice(0, 10)}.json`
	a.click()
	setTimeout(() => URL.revokeObjectURL(url), 2000)
}
function loadFile(ev) {
	const f = ev.target.files && ev.target.files[0]
	ev.target.value = ''
	if (!f) {
		return
	}
	const reader = new FileReader()
	reader.onload = () => {
		try {
			const d = JSON.parse(reader.result)
			if (d.format !== format || !d.params) {
				throw new Error(i18n.t('plugins.WorkshopRS485.paramsT3d.is_not_a_t3d_parameter_backup'))
			}
			applyAsChanges(d)
		} catch (e) {
			msg.value = i18n.t('plugins.WorkshopRS485.paramsT3d.could_not_load') + e.message
			msgError.value = true
		}
	}
	reader.readAsText(f)
}
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
.pt3-backup {
	display: flex;
	align-items: center;
	gap: 2px;
	padding: 4px 0;
	border-bottom: 1px solid rgba(128, 128, 128, 0.15);
}
.pt3-backup-name {
	flex: 1 1 auto;
	min-width: 0;
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
