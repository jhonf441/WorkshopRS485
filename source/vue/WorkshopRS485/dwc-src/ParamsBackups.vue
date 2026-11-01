<template>
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
				<v-btn size="x-small" variant="text" @click="loadFile()"><v-icon size="x-small" start>mdi-upload</v-icon>{{ $t('plugins.WorkshopRS485.paramsT3d.load_json_as_changes') }}</v-btn>
			</div>
		</v-card>
	</v-menu>
</template>

<script setup>
// The backups of the parameters of one T3D servo: the ones the service keeps on the SD (save, compare, restore, delete) and the file of the
// exchange standard (download, load with a preview). Loading or restoring does not write to the servo: the page puts the values in its list of
// pending changes (events `restore` and `load`); comparing shows the differences in the page (`compare`).
import { onBeforeUnmount, ref } from 'vue'
import { i18n, machineModel } from './dwc-host.js'
import { callService, useCan } from './api.js'
import { exchangeExportJson, exchangeImport } from './data-exchange-ui.js'
import { ts } from './shared-t.js'
import { backupData, exportBackup, importBackup, isBackup } from './params-backup.js'

const props = defineProps({
	dispId: { type: String, required: true },
	values: { type: Object, required: true }, // what was read: { "<register>": { value } | { error } }
	noExists: { type: Number, required: true },
	rows: { type: Array, required: true }, // the rows of the page (documented, partial and internal)
	edited: { type: Object, required: true },
	hasReading: Boolean,
	reading: Boolean
})
const emit = defineEmits(['compare', 'restore', 'load', 'message'])

const { can } = useCan()
const tp = (key, params) => i18n.t('plugins.WorkshopRS485.paramsT3d.' + key, params)
const menuBackup = ref(false)
const backups = ref([])
const noteBackup = ref('')
const savingBackup = ref(false)
const armedDelete = ref(null)
let armedTimer = null

onBeforeUnmount(() => clearTimeout(armedTimer))

function say(text, isError) {
	emit('message', text, isError)
}
function dataBackup() {
	return backupData(props.dispId, noteBackup.value, props.values, props.noExists)
}
async function loadBackups() {
	try {
		const r = await callService({ P: 'backups', I: props.dispId })
		backups.value = r.backups || []
	} catch (e) {
		say(tp('could_not_list_the_backups') + (e.message || e), true)
	}
}
async function saveBackup() {
	savingBackup.value = true
	try {
		const r = await callService({ P: 'backup_save', J: dataBackup() })
		say(tp('backup_saved_on_sd', { name: r.name }), false)
		noteBackup.value = ''
		await loadBackups()
	} catch (e) {
		say(tp('could_not_save_the_backup') + (e.message || e), true)
	} finally {
		savingBackup.value = false
	}
}
async function readBackup(r) {
	const d = await callService({ P: 'backup_read', N: r.name })
	if (!isBackup(d)) {
		throw new Error(tp('is_not_a_t3d_parameter_backup'))
	}
	return d
}
async function compareWith(r) {
	try {
		emit('compare', await readBackup(r))
		menuBackup.value = false
	} catch (e) {
		say(tp('could_not_read_the_backup') + (e.message || e), true)
	}
}
async function restore(r) {
	try {
		emit('restore', await readBackup(r))
		menuBackup.value = false
	} catch (e) {
		say(tp('could_not_read_the_backup') + (e.message || e), true)
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
		say(tp('could_not_delete', { error: e.message || String(e) }), true)
	})
}
// the parameters read as a file of the exchange standard (envelope workshop-rs485-servo-params)
function downloadBackup() {
	if (!exportBackup({ exchangeExportJson, data: dataBackup(), model: machineModel() })) {
		say(ts('exchange_export_failed'), true)
	}
}
// the file is checked and shown in a preview (the registers that would change); only when the person applies it the values go to the pending changes
function loadFile() {
	return importBackup({
		exchangeImport,
		model: machineModel(),
		t: tp,
		page: () => ({ device: props.dispId, rows: props.rows, values: props.values, edited: props.edited, read: props.hasReading }),
		apply: d => emit('load', d),
		notify: (text, ok) => say(text, !ok)
	})
}
</script>

<style scoped>
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
</style>
