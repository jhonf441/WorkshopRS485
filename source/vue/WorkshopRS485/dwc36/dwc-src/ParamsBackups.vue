<template>
	<v-menu v-model="menuBackup" offset-y left :close-on-content-click="false" max-width="440">
		<template v-slot:activator="{ on, attrs }">
			<v-btn small outlined v-bind="attrs" v-on="on" @click="loadBackups()"><v-icon small left>mdi-content-save-cog</v-icon>{{ $t('plugins.WorkshopRS485.paramsT3d.backups') }}</v-btn>
		</template>
		<v-card class="pa-3">
			<div class="text-subtitle-2">{{ $t('plugins.WorkshopRS485.paramsT3d.save_what_was_read_to_the') }}</div>
			<div class="d-flex align-center mt-1" style="gap:6px">
				<v-text-field v-model.trim="noteBackup" :placeholder="$t('plugins.WorkshopRS485.paramsT3d.note_optional_e_g_before_tuning')" dense outlined hide-details />
				<v-btn small color="primary" :disabled="!hasReading || reading || !can('rs485.backup_save')" :title="lockWhy('rs485.backup_save')" :loading="savingBackup" @click="saveBackup()">{{ $t('plugins.WorkshopRS485.common.save') }}</v-btn>
			</div>
			<div class="text-subtitle-2 mt-3">{{ $t('plugins.WorkshopRS485.paramsT3d.on_the_sd') }} <span class="grey--text text-caption">(sys/workshop/data/rs485-backups/)</span></div>
			<div v-if="!backups.length" class="text-caption grey--text">{{ $t('plugins.WorkshopRS485.paramsT3d.there_are_no_backups_of_this') }}</div>
			<div v-for="r in backups" :key="r.name" class="pt3-backup">
				<div class="pt3-backup-name">
					<div class="text-body-2">{{ (r.date || '').replace('T', ' ') }}<span v-if="r.note" class="grey--text"> &middot; {{ r.note }}</span></div>
					<div class="text-caption grey--text">{{ r.error ? r.error : $t('plugins.WorkshopRS485.paramsT3d.n_registers', { n: r.amount }) }}</div>
				</div>
				<v-btn x-small text :disabled="!!r.error" @click="compareWith(r)">{{ $t('plugins.WorkshopRS485.paramsT3d.compare') }}</v-btn>
				<v-btn x-small text :disabled="!!r.error" @click="restore(r)">{{ $t('plugins.WorkshopRS485.paramsT3d.restore') }}</v-btn>
				<v-btn :aria-label="$t('plugins.WorkshopRS485.shared.aria_delete')" x-small icon :disabled="!can('rs485.backup_delete')" :title="lockWhy('rs485.backup_delete')" :color="armedDelete === r.name ? 'error' : ''" @click="touchDeleteBackup(r)"><v-icon x-small>mdi-delete</v-icon></v-btn>
			</div>
			<v-divider class="my-2" />
			<div class="d-flex flex-wrap" style="gap:6px">
				<v-btn x-small text :disabled="!hasReading" @click="downloadBackup()"><v-icon x-small left>mdi-download</v-icon>{{ $t('plugins.WorkshopRS485.paramsT3d.download_json') }}</v-btn>
				<v-btn x-small text @click="loadFile()"><v-icon x-small left>mdi-upload</v-icon>{{ $t('plugins.WorkshopRS485.paramsT3d.load_json_as_changes') }}</v-btn>
			</div>
		</v-card>
	</v-menu>
</template>

<script>
import i18n from '../../i18n'

'use strict'

import { mapActions } from 'vuex'
import { callService, canMixin, refusal } from './api.js'
import { exchangeExportJson, exchangeImport } from './data-exchange-ui.js'
import { ts } from './shared-t.js'
import { backupData, exportBackup, importBackup, isBackup } from './params-backup.js'

// The backups of the parameters of one T3D servo: the ones the service keeps on the SD (save, compare, restore, delete) and the file of the
// exchange standard (download, load with a preview). Loading or restoring does not write to the servo: the page puts the values in its list of
// pending changes (events `restore` and `load`); comparing shows the differences in the page (`compare`).
export default { mixins: [canMixin],
	props: {
		dispId: { type: String, required: true },
		values: { type: Object, required: true }, // what was read: { "<register>": { value } | { error } }
		noExists: { type: Number, required: true },
		rows: { type: Array, required: true }, // the rows of the page (documented, partial and internal)
		edited: { type: Object, required: true },
		hasReading: Boolean,
		reading: Boolean
	},
	data() {
		return { menuBackup: false, backups: [], noteBackup: '', savingBackup: false, armedDelete: null, armedTimer: null };
	},
	beforeDestroy() {
		clearTimeout(this.armedTimer);
	},
	methods: {
		...mapActions('machine', ['sendCode']),
		tp(key, params) {
			return i18n.t('plugins.WorkshopRS485.paramsT3d.' + key, params);
		},
		say(text, isError) {
			this.$emit('message', text, isError);
		},
		dataBackup() {
			return backupData(this.dispId, this.noteBackup, this.values, this.noExists);
		},
		async loadBackups() {
			try {
				const r = await callService(this.sendCode, { P: 'backups', I: this.dispId });
				this.backups = r.backups || [];
			} catch (e) {
				this.say(refusal(e) || this.tp('could_not_list_the_backups') + (e.message || e), true);
			}
		},
		async saveBackup() {
			this.savingBackup = true;
			try {
				const r = await callService(this.sendCode, { P: 'backup_save', J: this.dataBackup() });
				this.say(this.tp('backup_saved_on_sd', { name: r.name }), false);
				this.noteBackup = '';
				await this.loadBackups();
			} catch (e) {
				this.say(refusal(e) || this.tp('could_not_save_the_backup') + (e.message || e), true);
			} finally {
				this.savingBackup = false;
			}
		},
		async readBackup(r) {
			const d = await callService(this.sendCode, { P: 'backup_read', N: r.name });
			if (!isBackup(d)) {
				throw new Error(this.tp('is_not_a_t3d_parameter_backup'));
			}
			return d;
		},
		async compareWith(r) {
			try {
				this.$emit('compare', await this.readBackup(r));
				this.menuBackup = false;
			} catch (e) {
				this.say(refusal(e) || this.tp('could_not_read_the_backup') + (e.message || e), true);
			}
		},
		async restore(r) {
			try {
				this.$emit('restore', await this.readBackup(r));
				this.menuBackup = false;
			} catch (e) {
				this.say(refusal(e) || this.tp('could_not_read_the_backup') + (e.message || e), true);
			}
		},
		touchDeleteBackup(r) {
			if (this.armedDelete !== r.name) {
				this.armedDelete = r.name;
				clearTimeout(this.armedTimer);
				this.armedTimer = setTimeout(() => { this.armedDelete = null; }, 4000);
				return;
			}
			this.armedDelete = null;
			callService(this.sendCode, { P: 'backup_delete', N: r.name }).then(() => this.loadBackups()).catch(e => {
				this.say(refusal(e) || this.tp('could_not_delete', { error: e.message || String(e) }), true);
			});
		},
		// the parameters read as a file of the exchange standard (envelope workshop-rs485-servo-params)
		downloadBackup() {
			if (!exportBackup({ exchangeExportJson, data: this.dataBackup(), model: this.$store.state.machine.model })) {
				this.say(ts('exchange_export_failed'), true);
			}
		},
		// the file is checked and shown in a preview (the registers that would change); only when the person applies it the values go to the pending changes
		loadFile() {
			return importBackup({
				exchangeImport,
				model: this.$store.state.machine.model,
				t: this.tp,
				page: () => ({ device: this.dispId, rows: this.rows, values: this.values, edited: this.edited, read: this.hasReading }),
				apply: d => this.$emit('load', d),
				notify: (text, ok) => this.say(text, !ok)
			});
		}
	}
};
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
