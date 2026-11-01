'use strict'

// data-exchange.js -- the single standard of the files that leave a page (export) and enter it (import). Pure: no DOM, no network.
// The same logic is in src/_shared/18-exchange.js for the hand-written JS plugins (tests/data-exchange.test.js runs both over the same
// cases); vue/_shared36 carries the same file. The format is documented in docs-internal/DATA-EXCHANGE.md.
//
// A JSON export is an envelope:
//   { format, version, plugin, createdAt, machine, data }
//     format     what the file holds, "workshop-<thing>" (workshop-zones, workshop-lights-profile)
//     version    integer: the layout of `data` for that format; a reader accepts only the versions it lists (no support for older ones)
//     plugin     id of the plugin that wrote it (WorkshopLights)
//     createdAt  ISO 8601, UTC
//     machine    { name, board, firmware }: where it was written (each one a string or null)
//     data       the payload; its shape belongs to the format
// A CSV export is a table with a fixed layout (exchangeCsv below).
// Nothing is applied from a file without the person confirming a preview of it (exchangeApply, data-exchange-ui.js).

export const EXCHANGE_MAX_BYTES = 5 * 1024 * 1024
export const EXCHANGE_FORMAT_RE = /^workshop(-[a-z0-9]+)+$/
export const EXCHANGE_PLUGIN_RE = /^Workshop[A-Za-z0-9]+$/
const COLUMN_RE = /^[a-z][a-z0-9_]*$/
const CSV_CHARS_RE = /[",\r\n]/
const CSV_FORMULA_RE = /^[=+\-@\t\r]/
const BLOB_MIME_RE = /^[a-z]+\/[a-z0-9.+-]+$/

function two(n) {
	return n < 10 ? '0' + n : String(n)
}

// "YYYYMMDD-HHMMSS" of a Date, in local time
export function exchangeStamp(now) {
	const d = now instanceof Date ? now : new Date()
	return d.getFullYear() + two(d.getMonth() + 1) + two(d.getDate()) + '-' + two(d.getHours()) + two(d.getMinutes()) + two(d.getSeconds())
}

// "YYYY-MM-DD HH:MM:SS" of a Date, in local time (the date format of every CSV cell)
export function exchangeLocalText(now) {
	const d = now instanceof Date ? now : new Date()
	return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()) + ' ' + two(d.getHours()) + ':' + two(d.getMinutes()) + ':' + two(d.getSeconds())
}

// The name of a downloaded file: <base>-<YYYYMMDD-HHMMSS>.<ext>; the base is lower case letters, digits and hyphens
export function exchangeFileName(base, ext, now) {
	const b = String(base || 'workshop').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'workshop'
	const e = String(ext || 'json').toLowerCase().replace(/[^a-z0-9]/g, '') || 'json'
	return b + '-' + exchangeStamp(now) + '.' + e
}

function short(v) {
	const t = v === null || v === undefined ? '' : String(v).trim()
	return t ? t.slice(0, 64) : null
}

// { name, board, firmware } from `machine` as given or null for what is missing
export function exchangeMachineOf(machine) {
	const m = machine && typeof machine === 'object' ? machine : {}
	return { name: short(m.name), board: short(m.board), firmware: short(m.firmware) }
}

// The machine as the object model of DWC tells it (model.network.name, model.boards[0])
export function exchangeMachine(model) {
	const m = model && typeof model === 'object' ? model : {}
	const board = Array.isArray(m.boards) && m.boards[0] ? m.boards[0] : {}
	return exchangeMachineOf({ name: m.network && m.network.name, board: board.shortName || board.name, firmware: board.firmwareVersion })
}

// The envelope of a JSON export. spec: { format, version, plugin, data, machine, now }. A wrong spec is a bug of the page: it throws.
export function exchangeEnvelope(spec) {
	const s = spec || {}
	if (!EXCHANGE_FORMAT_RE.test(String(s.format))) throw new Error('exchange: bad format ' + s.format)
	if (!Number.isInteger(s.version) || s.version < 1) throw new Error('exchange: bad version ' + s.version)
	if (!EXCHANGE_PLUGIN_RE.test(String(s.plugin))) throw new Error('exchange: bad plugin ' + s.plugin)
	if (s.data === undefined || s.data === null) throw new Error('exchange: no data')
	const at = s.now instanceof Date ? s.now : new Date()
	return { format: s.format, version: s.version, plugin: s.plugin, createdAt: at.toISOString(), machine: exchangeMachineOf(s.machine), data: s.data }
}

// The text of the file
export function exchangeText(envelope) {
	return JSON.stringify(envelope, null, 2) + '\n'
}

function failure(code, params) {
	return { ok: false, code, params: params || {} }
}

function isEnvelope(e) {
	return !!e && typeof e === 'object' && !Array.isArray(e) && EXCHANGE_FORMAT_RE.test(String(e.format)) && Number.isInteger(e.version) && e.version >= 1 &&
		EXCHANGE_PLUGIN_RE.test(String(e.plugin)) && typeof e.createdAt === 'string' && !isNaN(Date.parse(e.createdAt)) &&
		!!e.machine && typeof e.machine === 'object' && !Array.isArray(e.machine) && 'data' in e
}

// Reads and checks the text of a file. spec: { format, versions: [1], plugins: ['WorkshopLights'] (optional), machine (this machine, optional) }.
// -> { ok: true, envelope, data, warnings: [{ code, params }] } or { ok: false, code, params }
// codes: read, too_large, not_json, not_workshop, wrong_format, wrong_plugin, wrong_version, no_data. Warnings: other_machine.
export function exchangeRead(text, spec) {
	const s = spec || {}
	if (typeof text !== 'string') return failure('read')
	if (text.length > EXCHANGE_MAX_BYTES) return failure('too_large', { mb: Math.ceil(text.length / 1048576), max: Math.floor(EXCHANGE_MAX_BYTES / 1048576) })
	let env
	try {
		env = JSON.parse(text.replace(/^\uFEFF/, ''))
	} catch (e) {
		return failure('not_json')
	}
	if (!isEnvelope(env)) return failure('not_workshop')
	if (env.format !== s.format) return failure('wrong_format', { found: env.format, expected: s.format })
	if (Array.isArray(s.plugins) && s.plugins.indexOf(env.plugin) < 0) return failure('wrong_plugin', { plugin: env.plugin })
	const versions = Array.isArray(s.versions) ? s.versions : [1]
	if (versions.indexOf(env.version) < 0) return failure('wrong_version', { found: env.version, expected: versions.join(', ') })
	if (env.data === null || env.data === undefined) return failure('no_data')
	const warnings = []
	const here = exchangeMachineOf(s.machine).name
	const there = short(env.machine.name)
	if (here && there && here.toLowerCase() !== there.toLowerCase()) warnings.push({ code: 'other_machine', params: { machine: there } })
	return { ok: true, envelope: env, data: env.data, warnings }
}

// Applies what was read, and only after the person confirmed the preview. plan: { data, envelope, blockers: [text] }.
// `confirmed` must be exactly true; a plan with blockers is never applied. Resolves with what apply(data, envelope) returns.
export function exchangeApply(plan, confirmed, apply) {
	const fail = (code) => Promise.reject(Object.assign(new Error('exchange: ' + code), { code }))
	if (confirmed !== true) return fail('not_confirmed')
	if (!plan || plan.data === undefined || typeof apply !== 'function') return fail('nothing_to_apply')
	if (Array.isArray(plan.blockers) && plan.blockers.length) return fail('blocked')
	return Promise.resolve().then(() => apply(plan.data, plan.envelope))
}

function csvCell(v) {
	let t
	if (v === null || v === undefined) t = ''
	else if (v instanceof Date) t = isNaN(v.getTime()) ? '' : exchangeLocalText(v)
	else if (typeof v === 'number') t = isFinite(v) ? String(v) : ''
	else if (typeof v === 'boolean') t = v ? 'true' : 'false'
	else if (typeof v === 'object') t = JSON.stringify(v)
	else t = String(v)
	// a text that starts with = + - @ (or a tab or a return) is read by a spreadsheet as a formula: a quote goes first
	if (typeof v === 'string' && CSV_FORMULA_RE.test(t)) t = "'" + t
	return CSV_CHARS_RE.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t
}

// The text of a CSV file (fixed layout, docs-internal/DATA-EXCHANGE.md): comma separated, CRLF line ends (also after the last row),
// first row = the column keys (lower case, digits and _; never translated), a cell is quoted when it holds , " or a line break (" doubled),
// numbers with a dot and no unit, booleans true / false, dates "YYYY-MM-DD HH:MM:SS" local time, nothing = an empty cell.
// rows: arrays in the order of `columns`, or objects with those keys. The byte order mark is added when the file is saved.
export function exchangeCsv(columns, rows) {
	const cols = (columns || []).map(String)
	cols.forEach((c) => {
		if (!COLUMN_RE.test(c)) throw new Error('exchange: bad csv column ' + c)
	})
	const lines = [cols.join(',')]
	;(rows || []).forEach((row) => {
		lines.push(cols.map((c, i) => csvCell(Array.isArray(row) ? row[i] : row ? row[c] : null)).join(','))
	})
	return lines.join('\r\n') + '\r\n'
}

// What a file that is not data (a picture, a drawing) is made of, for exchangeSaveBlob: a text, or the bytes (an ArrayBuffer or a typed array).
// -> { parts: [data], type }, or null when there is nothing to save (empty, or neither a text nor bytes) or the type is not "kind/subtype".
// A text gets ";charset=utf-8". A Blob is not looked at here: the browser part hands it over as it is.
export function exchangeBlobParts(data, mime) {
	const type = String(mime || '').toLowerCase()
	if (!BLOB_MIME_RE.test(type)) return null
	if (typeof data === 'string') return data.length ? { parts: [data], type: type + ';charset=utf-8' } : null
	if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) return data.byteLength ? { parts: [data], type } : null
	return null
}
