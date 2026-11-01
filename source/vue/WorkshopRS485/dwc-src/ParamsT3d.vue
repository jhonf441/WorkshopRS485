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
			<params-backups :disp-id="dispId" :values="values" :no-exists="noExists" :rows="rows" :edited="edited" :has-reading="hasReading" :reading="reading"
				@compare="compareWith" @restore="applyAsChanges" @load="applyAsChanges" @message="say" />
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

				<param-card v-for="p in visible" :key="p.record" :p="p" :page="page" />
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
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { i18n } from './dwc-host.js'
import { action, info, useCan } from './api.js'
import { PARAMS_CACHE as CACHE } from './params-cache.js'
import { TOTAL, BY_READING, three, vcolor, bgClass, validate } from './params-model.js'
import ParamCard from './ParamCard.vue'
import ParamsBackups from './ParamsBackups.vue'
import { backupChanges } from './params-backup.js'

const props = defineProps({
	dispId: { type: String, required: true }
})

const { can, atLeast } = useCan()
const tp = (key, params) => i18n.t('plugins.WorkshopRS485.paramsT3d.' + key, params)
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
const comparing = ref(c.comparing || null)
const labels = ref({})
const risks = ref({})
const iconsGroup = ref({})
const functionsDi = ref({})
const functionsDo = ref({})
const msg = ref(null)
const msgError = ref(false)

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
		record: p.record, name: p.name, kind: 'partial', group: 'internal_factory', options: [], digits: [], description: '', note: tp('mentioned_in_the_manual_text_no')
	}))
	parc.forEach(p => known.add(p.record))
	const internal = []
	for (let r = 0; r < TOTAL; r++) {
		const v = values.value[r]
		if (!known.has(r) && v && (v.error || v.value !== noExists.value)) {
			internal.push({ record: r, name: tp('factory_internal_undocumented'), kind: 'internal', group: 'internal_factory', options: [], digits: [], description: '', note: '' })
		}
	}
	return [...doc, ...parc, ...internal].sort((a, b) => a.record - b.record)
})
const groupsAll = computed(() => [...groups.value, { id: 'internal_factory', name: tp('factory_internals'), description: tp('undocumented_registers_read_only') }])
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
		manual.value = r.manual || tp('t3d_manual')
		const a = r.help || {}
		labels.value = a.labels || {}
		risks.value = a.risks || {}
		iconsGroup.value = a.icons_group || {}
		functionsDi.value = a.functions_di || {}
		functionsDo.value = a.functions_do || {}
	} catch (e) {
		msg.value = tp('could_not_load_the_table') + (e.message || e)
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

function chooseLabel(id) {
	labelSel.value = labelSel.value === id ? null : id
	menuLabels.value = false
}
function countLabel(id) {
	return rows.value.filter(p => (p.labels || []).includes(id)).length
}
function valueFor(p) {
	const v = values.value[p.record]
	return v && !v.error && v.value !== noExists.value ? v.value : null
}
function choose(p, v) {
	if (p.only_reading) {
		return
	}
	edit(p, valueFor(p) === v ? null : v)
}
function invalidCurrent(p) {
	const v = values.value[p.record]
	return v && !v.error && v.value !== noExists.value ? validate(p, v.value, tp) : null
}
function invalidEdited(p) {
	const v = edited.value[p.record]
	return v === null || v === undefined || v === '' ? null : validate(p, Number(v), tp)
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
		hourReading.value = tp('read_at', { time: String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') })
	} catch (e) {
		msg.value = tp('reading_stopped_check', { error: e.message || String(e) })
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
		msg.value = tp('n_written_some_failed', { n: ok, list: faults.join(' | ') })
		msgError.value = true
	} else {
		msg.value = tp('n_written_verified', { n: ok })
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
		msg.value = tp('saved_in_the_servo_eeprom_the')
		msgError.value = false
	} catch (e) {
		msg.value = i18n.t('plugins.WorkshopRS485.common.could_not_save') + (e.message || e)
		msgError.value = true
	} finally {
		savingEeprom.value = false
	}
}
// the message line of the page, for the backups panel too
function say(text, isError) {
	msg.value = text
	msgError.value = !!isError
}
// -- backups ---------------------------------------------------------
// Compare shows the differences with a backup the service read; the values to load go to "changes" (nothing is written to the servo)
function compareWith(d) {
	comparing.value = d
	view.value = 'backup'
}
// Only the documented and writable parameters go to "changes"; the factory internal ones stay in the backup as a reference.
// It looks at the rows and the values as they are now (they may have changed while the preview was open). Returns how many changed.
function applyAsChanges(d) {
	const plan = backupChanges(d, rows.value, values.value, tp)
	plan.changes.forEach(ch => { edited.value[ch.record] = ch.after })
	const n = plan.changes.length
	msg.value = n ? tp('backup_values_as_changes', { date: String(d.date || '').slice(0, 10), n })
		: tp('the_backup_matches_what_the_servo')
	msgError.value = false
	filter.value = ''
	return n
}
// what the card needs of the page: the state (refs unwrap) and the actions
const page = reactive({
	values, edited, written, risks, noExists, comparing, labels, iconsGroup, functionsDi, functionsDo, groupsAll, modeServo,
	isPending, invalidCurrent, invalidEdited, differentOfFactory, differentOfBackup, valueBackup, valueFor, chooseLabel, edit, choose
})
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
.pt3-bar-span {
	position: relative;
	flex: 1 1 auto;
	height: 6px;
	border-radius: 3px;
	background: linear-gradient(90deg, rgba(128, 128, 128, 0.25), rgba(128, 128, 128, 0.45));
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
