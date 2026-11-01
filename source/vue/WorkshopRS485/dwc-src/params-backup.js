'use strict'

// The backup of the parameters of a T3D servo (ParamsT3d.vue, ParamsBackups.vue) as a file of the exchange standard (docs-internal/DATA-EXCHANGE.md):
// its format, what loading it would change and the preview a person sees before it is loaded. Plain functions of their arguments, the same file in
// both DWC lines, run by test/params-backup.test.js. The texts come in as `t(key, params)` (keys relative to plugins.WorkshopRS485.paramsT3d).
//
// The payload is the same for the file and for the backups the service keeps on the SD (rs485.backup_save / backup_read):
//   { device, date, note, params: { "<register>": <value stored in the servo> } }
// Loading a backup does not write to the servo: it puts the values in the list of pending changes of the page, and the person writes them.

import { TOTAL, three, validate } from './params-model.js'

export const BACKUP_FORMAT = 'workshop-rs485-servo-params'
export const BACKUP_VERSION = 1
export const BACKUP_PLUGIN = 'WorkshopRS485'
export const BACKUP_SPEC = { format: BACKUP_FORMAT, versions: [BACKUP_VERSION], plugins: [BACKUP_PLUGIN] }
// the rows of changes a preview lists before it says "and n more"
const LISTED = 15

// What was read from the servo: values = { "<register>": { value } | { error } }. Registers that did not answer or do not exist are left out.
export function backupData(device, note, values, noExists, now) {
	const params = {}
	Object.keys(values || {}).forEach(k => {
		const v = values[k]
		if (v && !v.error && v.value !== noExists) {
			params[k] = v.value
		}
	})
	return { device: String(device), date: (now instanceof Date ? now : new Date()).toISOString(), note: String(note || ''), params }
}

// Is it a backup of parameters: an object with a `params` table
export function isBackup(d) {
	return !!d && typeof d === 'object' && !Array.isArray(d) && !!d.params && typeof d.params === 'object' && !Array.isArray(d.params)
}

// What loading the backup `d` would change, over the rows of the page (documented, partial and internal) and the values read now:
// { entries, changes: [{ record, name, before, after, reason }], ignored }
//   entries  how many registers the file holds
//   changes  the documented parameters the manual lets the person write whose value in the file is not the one in the servo; `before` is null when
//            the servo has not been read (or did not answer) for that register; `reason` is what the manual says about the value, or null
//   ignored  entries whose key is not a register 0-255 written as a plain number, or whose value is not a whole number: they are never loaded
export function backupChanges(d, rows, values, t) {
	const out = { entries: 0, changes: [], ignored: 0 }
	if (!isBackup(d)) {
		return out
	}
	Object.keys(d.params).forEach(k => {
		out.entries++
		const record = Number(k)
		const after = d.params[k]
		if (!/^(0|[1-9]\d*)$/.test(k) || record >= TOTAL || typeof after !== 'number' || !Number.isInteger(after)) {
			out.ignored++
			return
		}
		const p = (rows || []).find(x => x.record === record)
		const current = (values || {})[record]
		if (p && p.kind === 'doc' && !p.only_reading && (!current || current.error || current.value !== after)) {
			out.changes.push({ record, name: p.name, before: current && !current.error ? current.value : null, after, reason: validate(p, after, t) })
		}
	})
	out.changes.sort((a, b) => a.record - b.record)
	return out
}

// The preview of a file that was read: what it holds and what would change. It changes nothing.
// page: { device (id of this servo), rows, values, edited, read (has the servo been read) }; t: the translator described above
export function backupPreview(d, page, t) {
	if (!isBackup(d)) {
		return { rows: [], blockers: [t('backup_not_a_backup')] }
	}
	const plan = backupChanges(d, page.rows, page.values, t)
	const rows = [{ label: t('backup_entries'), value: String(plan.entries) }, { label: t('backup_changes'), value: String(plan.changes.length) }]
	plan.changes.slice(0, LISTED).forEach(c => rows.push({ label: 'P-' + three(c.record) + ' ' + c.name, value: (c.before === null ? '?' : c.before) + ' → ' + c.after }))
	if (plan.changes.length > LISTED) {
		rows.push({ label: '', value: t('and_n_more', { n: plan.changes.length - LISTED }) })
	}
	rows.push({ label: t('backup_after'), value: t('backup_after_value') })
	const warnings = []
	if (d.device && String(d.device) !== String(page.device)) {
		warnings.push(t('backup_other_device', { device: d.device, current: page.device }))
	}
	if (!page.read) {
		warnings.push(t('backup_not_read'))
	}
	const invalid = plan.changes.filter(c => c.reason).length
	if (invalid) {
		warnings.push(t('backup_out_of_range', { n: invalid }))
	}
	const typed = plan.changes.filter(c => page.edited && page.edited[c.record] != null).length
	if (typed) {
		warnings.push(t('backup_replaces_typed', { n: typed }))
	}
	if (plan.ignored) {
		warnings.push(t('backup_ignored', { n: plan.ignored }))
	}
	const blockers = plan.changes.length ? [] : [t('backup_nothing_changes')]
	return { rows, warnings, blockers }
}

// The backup as a file of the exchange standard: downloads `ctx.data` (backupData) as the envelope. -> false when the browser did not allow it
//   ctx: { exchangeExportJson (data-exchange-ui.js), data, model (object model of DWC) }
export function exportBackup(ctx) {
	return ctx.exchangeExportJson({ format: BACKUP_FORMAT, version: BACKUP_VERSION, plugin: BACKUP_PLUGIN, data: ctx.data, model: ctx.model }).ok
}

// The load of a backup file, for ParamsBackups.vue: the file is read and checked as a Workshop file, the person sees what would change, and only
// Apply hands the backup to `apply` (the page puts the values in its list of pending changes: nothing is written to the servo). The page gives
// what it owns in `ctx`:
//   exchangeImport  the shared flow (data-exchange-ui.js)        model  object model of DWC          t  translator (keys relative to paramsT3d)
//   page()          { device, rows, values, edited, read } as the panel is NOW (asked for the preview)
//   apply(d)        puts the backup in the list of pending changes           notify(text, ok)  the page's message line
export function importBackup(ctx) {
	return ctx.exchangeImport({
		what: ctx.t('backup_noun'),
		spec: BACKUP_SPEC,
		model: ctx.model,
		preview: d => backupPreview(d, ctx.page(), ctx.t),
		apply: async d => ctx.apply(d),
		notify: ctx.notify
	})
}
