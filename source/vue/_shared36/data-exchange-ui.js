'use strict'

// data-exchange-ui.js -- the browser part of the exchange standard (data-exchange.js is the pure part): save a file, pick a file and the
// import flow with a preview. The same logic is in src/_shared/18-exchange-ui.js for the hand-written JS plugins; vue/_shared36 carries
// the same file. A page never builds a Blob, a download link or a file input of its own (tests/no-adhoc-exchange.test.js).
//
//   exchangeExportJson({ format, version, plugin, data, model })      -> { ok, name }   downloads the envelope of data
//   exchangeExportCsv(base, columns, rows)                            -> { ok, name }   downloads a CSV with the fixed layout
//   exchangeSaveBlob(name, data, mime)                                -> boolean        downloads a picture or a drawing (a Blob, a text or the bytes)
//   exchangeImport({ what, accept, spec, model, preview, apply, notify })
//       what     text for the title of the preview ("lighting profile")
//       spec     { format, versions, plugins }  (data-exchange.js exchangeRead)
//       model    object model of DWC, to name this machine and warn when the file comes from another one
//       preview  (data, envelope) -> { rows: [{ label, value }], warnings: [text], blockers: [text] }, or a Promise of it (a question to the service);
//                changes nothing. If it throws or rejects, the import ends: the page is told and nothing is applied
//       apply    (data, envelope) -> Promise; runs only after the person pressed Apply in the preview, never when there are blockers
//       notify   (text, ok) the page's own message line: failures of the file and of apply come here
//     -> Promise<{ state: 'applied' | 'cancelled' | 'rejected' | 'failed' }>   (failed: the preview or apply threw)
import { ts } from './shared-t.js'
import { EXCHANGE_MAX_BYTES, exchangeApply, exchangeBlobParts, exchangeCsv, exchangeEnvelope, exchangeFileName, exchangeMachine, exchangeRead, exchangeText } from './data-exchange.js'

// Hands what make() builds (a Blob) to the browser as a file called `name`. Returns false when the browser does not allow it.
function download(name, make) {
	try {
		const url = URL.createObjectURL(make())
		const a = document.createElement('a')
		a.href = url
		a.download = name
		a.style.display = 'none'
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
		setTimeout(() => URL.revokeObjectURL(url), 2000)
		return true
	} catch (e) {
		return false
	}
}

// Hands a text to the browser as a file. Returns false when the browser does not allow it. bom: a byte order mark goes first
// (CSV: so a spreadsheet opens the accents correctly)
export function exchangeSave(name, text, mime, bom) {
	return download(name, () => new Blob([(bom ? '\uFEFF' : '') + text], { type: mime + ';charset=utf-8' }))
}

// Hands a picture or a drawing to the browser as a file: a Blob (a canvas gives one), a text or the bytes. It is not data, so it has no envelope.
// Returns false when there is nothing to save (an empty Blob, text or bytes) or the browser does not allow it.
export function exchangeSaveBlob(name, data, mime) {
	if (typeof Blob !== 'undefined' && data instanceof Blob) return data.size > 0 && download(name, () => data)
	const b = exchangeBlobParts(data, mime)
	return !!b && download(name, () => new Blob(b.parts, { type: b.type }))
}

export function exchangeExportJson(opts) {
	const o = opts || {}
	const envelope = exchangeEnvelope({ format: o.format, version: o.version, plugin: o.plugin, data: o.data, machine: exchangeMachine(o.model) })
	const name = exchangeFileName(o.format, 'json')
	return { ok: exchangeSave(name, exchangeText(envelope), 'application/json', false), name }
}

export function exchangeExportCsv(base, columns, rows) {
	const name = exchangeFileName(base, 'csv')
	return { ok: exchangeSave(name, exchangeCsv(columns, rows), 'text/csv', true), name }
}

// Asks the person for a file: resolves the File, or null when the dialog is closed. Call it straight from the click.
export function exchangePick(accept) {
	return new Promise(resolve => {
		const input = document.createElement('input')
		input.type = 'file'
		input.accept = accept || '.json,application/json'
		input.style.display = 'none'
		const end = file => {
			if (input.parentNode) input.parentNode.removeChild(input)
			resolve(file)
		}
		input.addEventListener('change', () => end(input.files && input.files[0] ? input.files[0] : null))
		input.addEventListener('cancel', () => end(null))
		document.body.appendChild(input)
		input.click()
	})
}

// the catalog key of every code of exchangeRead (tests/data-exchange-ui.test.js checks each one exists in both languages)
const ERROR_KEYS = {
	read: 'exchange_err_read',
	too_large: 'exchange_err_too_large',
	not_json: 'exchange_err_not_json',
	not_workshop: 'exchange_err_not_workshop',
	wrong_format: 'exchange_err_wrong_format',
	wrong_plugin: 'exchange_err_wrong_plugin',
	wrong_version: 'exchange_err_wrong_version',
	no_data: 'exchange_err_no_data'
}
const WARNING_KEYS = { other_machine: 'exchange_warn_other_machine' }

export function exchangeErrorText(read) {
	return ts(ERROR_KEYS[read.code] || ERROR_KEYS.read, read.params)
}

// The text of a File checked as a Workshop file (exchangeRead): the size is looked at before the file is read
export async function exchangeReadFile(file, spec) {
	if (file && file.size > EXCHANGE_MAX_BYTES) return { ok: false, code: 'too_large', params: { mb: Math.ceil(file.size / 1048576), max: Math.floor(EXCHANGE_MAX_BYTES / 1048576) } }
	let text = null
	try {
		text = await file.text()
	} catch (e) {
		text = null
	}
	return exchangeRead(text, spec)
}

function el(tag, css, text) {
	const e = document.createElement(tag)
	if (css) e.style.cssText = css
	if (text !== undefined && text !== null) e.textContent = text
	return e
}

const BTN = 'border:0;border-radius:6px;padding:8px 14px;min-height:44px;font-size:14px;cursor:pointer;color:#fff;'

function dialogLists(box, view) {
	view.warnings.forEach(w => box.appendChild(el('div', 'color:#ffb74d;margin-top:8px;', w)))
	view.blockers.forEach(b => box.appendChild(el('div', 'color:#ef9a9a;margin-top:8px;font-weight:600;', b)))
	if (view.rows.length) {
		const list = el('div', 'margin-top:10px;padding:8px 10px;border-radius:4px;background:rgba(255,255,255,0.05);')
		view.rows.forEach(r => {
			const row = el('div', 'display:flex;gap:12px;justify-content:space-between;padding:2px 0;')
			row.appendChild(el('span', 'color:#b0bec5;', r.label))
			row.appendChild(el('span', 'text-align:right;word-break:break-word;', r.value))
			list.appendChild(row)
		})
		box.appendChild(list)
	}
}

// The preview: what the file holds and what would change. Resolves true only when the person presses Apply (Escape and Cancel give false).
// view: { title, source, rows, warnings, blockers, note, applyLabel, cancelLabel }. With blockers there is no Apply button.
export function exchangeDialog(view) {
	return new Promise(resolve => {
		const back = el('div', 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto;')
		back.setAttribute('data-workshop-exchange', '1')
		const box = el('div', 'background:#1e272c;color:#eceff1;border:1px solid rgba(255,255,255,0.12);border-left:4px solid #1976d2;border-radius:6px;max-width:520px;width:100%;max-height:100%;overflow:auto;padding:14px 16px;font-size:13px;line-height:1.45;font-family:Roboto,Helvetica,Arial,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,0.5);')
		box.setAttribute('role', 'dialog')
		box.setAttribute('aria-modal', 'true')
		box.setAttribute('aria-label', String(view.title))
		box.appendChild(el('div', 'font-size:16px;font-weight:600;color:#90caf9;margin-bottom:4px;', view.title))
		box.appendChild(el('div', 'color:#b0bec5;', view.source))
		dialogLists(box, view)
		box.appendChild(el('div', 'color:#b0bec5;margin-top:10px;', view.note))
		const buttons = el('div', 'display:flex;gap:8px;justify-content:flex-end;margin-top:12px;')
		const cancel = el('button', BTN + 'background:#455a64;', view.cancelLabel)
		cancel.type = 'button'
		cancel.setAttribute('data-exchange', 'cancel')
		buttons.appendChild(cancel)
		const key = ev => {
			if (ev.key === 'Escape') end(false)
		}
		const end = value => {
			document.removeEventListener('keydown', key, true)
			if (back.parentNode) back.parentNode.removeChild(back)
			resolve(value)
		}
		cancel.addEventListener('click', () => end(false))
		if (!view.blockers.length) {
			const ok = el('button', BTN + 'background:#1976d2;font-weight:600;', view.applyLabel)
			ok.type = 'button'
			ok.setAttribute('data-exchange', 'apply')
			ok.addEventListener('click', () => end(true))
			buttons.appendChild(ok)
		}
		document.addEventListener('keydown', key, true)
		box.appendChild(buttons)
		back.appendChild(box)
		;(document.fullscreenElement || document.body).appendChild(back)
		cancel.focus()
	})
}

async function importView(read, o) {
	const p = (o.preview ? await o.preview(read.data, read.envelope) : null) || {}
	const env = read.envelope
	const when = new Date(env.createdAt).toLocaleString()
	const blockers = p.blockers || []
	return {
		title: ts('exchange_title', { what: o.what || '' }),
		source: env.machine.name ? ts('exchange_source_machine', { plugin: env.plugin, date: when, machine: env.machine.name }) : ts('exchange_source', { plugin: env.plugin, date: when }),
		rows: p.rows || [],
		warnings: read.warnings.filter(w => WARNING_KEYS[w.code]).map(w => ts(WARNING_KEYS[w.code], w.params)).concat(p.warnings || []),
		blockers,
		note: blockers.length ? ts('exchange_blocked') : ts('exchange_note'),
		applyLabel: ts('exchange_apply'),
		cancelLabel: blockers.length ? ts('exchange_close') : ts('exchange_cancel')
	}
}

// The import flow of a file already chosen: read and check it, show the preview, and only if the person presses Apply run apply.
export async function exchangeImportFile(file, opts) {
	const o = opts || {}
	const notify = typeof o.notify === 'function' ? o.notify : () => {}
	const read = await exchangeReadFile(file, Object.assign({}, o.spec, { machine: exchangeMachine(o.model) }))
	if (!read.ok) {
		notify(exchangeErrorText(read), false)
		return { state: 'rejected', code: read.code }
	}
	let view
	try {
		view = await importView(read, o)
	} catch (e) {
		notify(String((e && e.message) || e), false)
		return { state: 'failed', error: e }
	}
	if (!(await exchangeDialog(view))) return { state: 'cancelled' }
	try {
		await exchangeApply({ data: read.data, envelope: read.envelope, blockers: view.blockers }, true, o.apply)
		return { state: 'applied' }
	} catch (e) {
		notify(String((e && e.message) || e), false)
		return { state: 'failed', error: e }
	}
}

export async function exchangeImport(opts) {
	const file = await exchangePick((opts && opts.accept) || '.json,application/json')
	if (!file) return { state: 'cancelled' }
	return exchangeImportFile(file, opts)
}
