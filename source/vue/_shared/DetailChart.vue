<template>
	<div ref="root" class="detail-chart-wrap" :style="{ height: height + 'px' }">
		<div v-if="unit" class="detail-chart-unit">{{ unit }}</div>
		<canvas ref="canvas"></canvas>
		<button
			v-if="isZoomed" type="button" class="detail-chart-reset"
			:title="ts('chart_reset_zoom_title')" @click="resetZoom"
		><v-icon size="x-small" class="mr-1">mdi-magnify-minus-outline</v-icon>{{ ts('chart_reset_zoom') }}</button>
		<button
			v-if="isTimed" type="button" class="detail-chart-scale"
			:title="scaleTitles[scaleMode]" @click="cycleScale"
		>{{ scaleLabels[scaleMode] }}</button>
		<div v-if="history.length < 2" class="detail-chart-nodata">{{ ts('chart_waiting') }}</div>
		<div v-if="wheelHint" class="detail-chart-hint">{{ ts('chart_wheel_hint') }}</div>
	</div>
</template>

<script setup>
// Time-series chart shared by the workshop pages (Chart.js 4, bundled inside each plugin: DWC does not expose Chart.js).
// 3.6 -> 3.7 changes: Chart.js 2 -> 4 (scales.x / scales.y, grid, plugins.tooltip, plugins.legend, interaction) and the zoom plugin
// (chartjs-plugin-zoom + Hammer) replaced by the small pointer handler below: horizontal zoom and pan only, so no extra npm package.
// Gestures: the wheel zooms only after a click or a tap on the chart (before that it scrolls the page and a hint says how),
// Ctrl+wheel stays the browser's zoom, dragging pans, two fingers pinch.
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { Chart, CategoryScale, Filler, Legend, LinearScale, LineController, LineElement, LogarithmicScale, PointElement, Tooltip } from 'chart.js'
import { ts } from './shared-t.js'
import { withGaps, timeRange, formatValue, linearRange } from './chart-data.js'

Chart.register(CategoryScale, Filler, Legend, LinearScale, LineController, LineElement, LogarithmicScale, PointElement, Tooltip)

const props = defineProps({
	// Each item can be a plain number (X axis by index, "-30s" etc., pages that have not migrated) or an object {t, y} with
	// t = real epoch ms (real-time X axis, needed so that zoom/pan does not "jump" every time a new sample arrives).
	history: { type: Array, required: true },
	label: { type: String, default: '' },
	color: { type: String, default: '#42A5F5' },
	unit: { type: String, default: '' },
	height: { type: Number, default: 160 },
	// Horizontal reference line (e.g. the limit configured by M203), drawn as a second flat, dotted dataset.
	limit: { type: Number, default: null },
	limitLabel: { type: String, default: 'limit' },
	sampleIntervalS: { type: Number, default: 1 },
	// a silence longer than gapMs between two samples cuts the line (no ramp that was never measured)
	gapMs: { type: Number, default: null },
	// the x window without zoom (epoch ms): the same for every chart of a page, ending now
	xMin: { type: Number, default: null },
	xMax: { type: Number, default: null },
	limitColor: { type: String, default: '#FF5252' },
	// a single series named by its title needs no legend box
	legend: { type: Boolean, default: true },
	// false: the linear axis fits the data (a 24 V supply that sags 1 V), true: it starts at 0
	zeroBased: { type: Boolean, default: true }
})

// Y axis scale: during a live cut 91% of the time goes at ~6 mm/s and the travels at ~385 mm/s, so in linear the cutting line
// ended up glued to the floor. Three modes, changed with the chart's button and remembered on THIS screen (all charts together).
const SCALE_KEY = 'workshopChartScale'
const SCALE_MODES = ['lin', 'log', 'clip']
const GRID = 'rgba(128,128,128,0.15)'
const ZERO_LINE = 'rgba(128,128,128,0.25)'

// the log scale labels the ticks whose mantissa is 1, 2 or 5 (1, 2, 5, 10, 20, 50...)
function isLogLabel(v) {
	if (!(v > 0)) return false
	const m = v / Math.pow(10, Math.floor(Math.log10(v) + 1e-9))
	return [1, 2, 5].some(k => Math.abs(m - k) < 1e-6)
}

// Tooltip position: with mode 'index' the tooltip includes ALL datasets, also the limit line and the peaks that fall outside the
// axis. The built-in 'average' positioner averages those points and drew the box far outside the canvas. This one averages only
// the visible points and stays inside the chart area.
Tooltip.positioners.workshopVisible = function (elements, eventPosition) {
	if (!elements.length) return false
	const area = this.chart.chartArea
	const all = elements.map(e => e.element.tooltipPosition())
	const inside = all.filter(p => p.y >= area.top && p.y <= area.bottom)
	const pts = inside.length ? inside : all
	const x = pts.reduce((s, p) => s + p.x, 0) / pts.length
	const y = inside.length ? pts.reduce((s, p) => s + p.y, 0) / pts.length : eventPosition.y
	return { x: Math.min(Math.max(x, area.left), area.right), y: Math.min(Math.max(y, area.top), area.bottom) }
}

function roundUpNice(v) {
	if (v <= 0) return 1
	const magnitude = Math.pow(10, Math.floor(Math.log10(v)) - 1)
	return Math.ceil(v / magnitude) * magnitude
}

// A single mode for ALL the charts on the screen: tapping the button on one changes them all (module level, shared by instances).
const scaleStore = reactive({ mode: 'lin' })
try {
	const saved = localStorage.getItem(SCALE_KEY)
	if (SCALE_MODES.includes(saved)) scaleStore.mode = saved
} catch (e) {
	/* no localStorage: linear */
}

const root = ref(null)
const canvas = ref(null)
const isZoomed = ref(false)
const engaged = ref(false)
const wheelHint = ref(false)

let chart = null // not reactive on purpose: Chart.js keeps its own state
let builtAsTimed = false
let interacting = false
let lastMouse = null
let hintTimer = null
let view = null // {min, max} epoch ms while zoomed / panned

const scaleLabels = computed(() => ({ lin: ts('chart_scale_linear'), log: ts('chart_scale_log'), clip: ts('chart_scale_clip') }))
const scaleTitles = computed(() => ({ lin: ts('chart_scale_linear_title'), log: ts('chart_scale_log_title'), clip: ts('chart_scale_clip_title') }))
const scaleMode = computed(() => scaleStore.mode)
const isTimed = computed(() => {
	const first = props.history[0]
	return !!first && typeof first === 'object' && 't' in first
})

// what changes when a sample arrives or the page edits the array in place (length, last point)
const changeKey = computed(() => {
	const h = props.history
	const last = h[h.length - 1]
	return h.length + ':' + (last && typeof last === 'object' ? last.t + '/' + last.y : last)
})
watch([() => props.history, changeKey, () => props.limit, () => props.xMax], () => refresh())
// The scale TYPE (linear/logarithmic) cannot be changed with update(): the chart is rebuilt (the horizontal zoom is lost).
watch(scaleMode, () => {
	if (chart) {
		chart.destroy()
		chart = null
	}
	view = null
	isZoomed.value = false
	build()
})

onMounted(() => {
	build()
	// Track the mouse position on our own to "re-fire" the hover on the same point after each refresh(): without it the tooltip
	// closes by itself every time a new sample arrives, because Chart.js replaces the data and loses the active hover.
	canvas.value.addEventListener('mousemove', onCanvasMouseMove)
	canvas.value.addEventListener('mouseleave', onCanvasMouseLeave)
	canvas.value.addEventListener('pointerdown', onPointerDown)
	canvas.value.addEventListener('pointermove', onPointerMove)
	canvas.value.addEventListener('pointerup', onPointerEnd)
	canvas.value.addEventListener('pointercancel', onPointerEnd)
	root.value.addEventListener('wheel', onWheel, { passive: false })
	root.value.addEventListener('mousedown', onEngage)
	root.value.addEventListener('touchstart', onEngage, { passive: true })
	root.value.addEventListener('mouseleave', onRelease)
})
onBeforeUnmount(() => {
	clearTimeout(hintTimer)
	if (root.value) {
		root.value.removeEventListener('wheel', onWheel)
		root.value.removeEventListener('mousedown', onEngage)
		root.value.removeEventListener('touchstart', onEngage)
		root.value.removeEventListener('mouseleave', onRelease)
	}
	if (canvas.value) {
		canvas.value.removeEventListener('mousemove', onCanvasMouseMove)
		canvas.value.removeEventListener('mouseleave', onCanvasMouseLeave)
		canvas.value.removeEventListener('pointerdown', onPointerDown)
		canvas.value.removeEventListener('pointermove', onPointerMove)
		canvas.value.removeEventListener('pointerup', onPointerEnd)
		canvas.value.removeEventListener('pointercancel', onPointerEnd)
	}
	if (chart) {
		chart.destroy()
		chart = null
	}
})

function cycleScale() {
	scaleStore.mode = SCALE_MODES[(SCALE_MODES.indexOf(scaleStore.mode) + 1) % SCALE_MODES.length]
	try {
		localStorage.setItem(SCALE_KEY, scaleStore.mode)
	} catch (e) {
		/* not critical */
	}
}
function onCanvasMouseMove(evt) {
	lastMouse = { clientX: evt.clientX, clientY: evt.clientY }
}
function onCanvasMouseLeave() {
	lastMouse = null
}
function onEngage() {
	engaged.value = true
	wheelHint.value = false
}
function onRelease() {
	engaged.value = false
}

// ---- horizontal zoom and pan (replaces chartjs-plugin-zoom) ----

// the x window now: the zoomed one, or the one without zoom
function currentWindow() {
	if (view) return view
	return timeRange(props.history, props.xMin, props.xMax)
}
function setView(min, max) {
	const full = timeRange(props.history, props.xMin, props.xMax)
	// shown at least 2 s; the whole range (or more) is "no zoom"
	if (!full || max - min >= full.max - full.min) {
		view = null
		isZoomed.value = false
	} else {
		view = { min, max: Math.max(max, min + 2000) }
		isZoomed.value = true
	}
	applyAxes()
	if (chart) chart.update('none')
}
// zoom around the pixel x (factor < 1 zooms in)
function zoomAt(px, factor) {
	const w = currentWindow()
	if (!w || !chart) return
	const area = chart.chartArea
	const frac = Math.min(1, Math.max(0, (px - area.left) / Math.max(1, area.right - area.left)))
	const pivot = w.min + frac * (w.max - w.min)
	const span = (w.max - w.min) * factor
	setView(pivot - frac * span, pivot + (1 - frac) * span)
}
function panBy(dxPixels) {
	const w = currentWindow()
	if (!w || !chart) return
	const area = chart.chartArea
	const shift = -dxPixels * (w.max - w.min) / Math.max(1, area.right - area.left)
	setView(w.min + shift, w.max + shift)
}
function onWheel(ev) {
	// Ctrl+wheel (and the touchpad pinch, which arrives the same) is the browser's zoom
	if (ev.ctrlKey || ev.metaKey) return
	if (!engaged.value || !isTimed.value) {
		wheelHint.value = true
		clearTimeout(hintTimer)
		hintTimer = setTimeout(() => { wheelHint.value = false }, 1500)
		return
	}
	ev.preventDefault()
	const rect = canvas.value.getBoundingClientRect()
	interacting = true
	zoomAt(ev.clientX - rect.left, ev.deltaY < 0 ? 0.8 : 1.25)
	clearTimeout(onWheel.timer)
	onWheel.timer = setTimeout(endGesture, 250)
}
const pointers = new Map()
let pinchStart = 0
function onPointerDown(ev) {
	if (!isTimed.value) return
	pointers.set(ev.pointerId, { x: ev.clientX })
	try { canvas.value.setPointerCapture(ev.pointerId) } catch (e) { /* not capturable */ }
	pinchStart = pointers.size === 2 ? Math.abs([...pointers.values()][0].x - [...pointers.values()][1].x) : 0
	interacting = true
}
function onPointerMove(ev) {
	const p = pointers.get(ev.pointerId)
	if (!p) return
	if (pointers.size === 1) {
		const dx = ev.clientX - p.x
		p.x = ev.clientX
		if (dx !== 0) panBy(dx)
	} else if (pointers.size === 2) {
		p.x = ev.clientX
		const xs = [...pointers.values()].map(q => q.x)
		const dist = Math.abs(xs[0] - xs[1])
		if (pinchStart > 10 && dist > 10) {
			const rect = canvas.value.getBoundingClientRect()
			zoomAt((xs[0] + xs[1]) / 2 - rect.left, pinchStart / dist)
			pinchStart = dist
		}
	}
}
function onPointerEnd(ev) {
	pointers.delete(ev.pointerId)
	pinchStart = 0
	if (!pointers.size) endGesture()
}
// the gesture is over: catch up with the samples that arrived meanwhile
function endGesture() {
	interacting = false
	refresh()
}
function resetZoom() {
	view = null
	isZoomed.value = false
	if (chart) {
		applyAxes()
		chart.update('none')
	}
}

// ---- axes ----

function formatSeconds(totalS) {
	const sign = totalS < 0 ? '-' : ''
	totalS = Math.abs(totalS)
	if (totalS < 60) return `${sign}${totalS}s`
	if (totalS < 3600) {
		const m = Math.floor(totalS / 60)
		const s = totalS % 60
		return `${sign}${m}:${String(s).padStart(2, '0')}`
	}
	if (totalS < 86400) {
		const h = Math.floor(totalS / 3600)
		const m = Math.floor((totalS % 3600) / 60)
		return `${sign}${h}h${m ? ' ' + m + 'm' : ''}`
	}
	const d = Math.floor(totalS / 86400)
	const h = Math.floor((totalS % 86400) / 3600)
	return `${sign}${d}d${h ? ' ' + h + 'h' : ''}`
}
// epoch ms -> "2:05 ago" / "in 0:03" (a pan toward the future should not happen, but the clocks of the browser and the backend may differ)
function formatAgoMs(epochMs) {
	const deltaS = Math.round((Date.now() - epochMs) / 1000)
	return deltaS >= 0 ? ts('chart_ago', { t: formatSeconds(deltaS) }) : ts('chart_ahead', { t: formatSeconds(-deltaS) })
}
// compact version only for the axis LABELS: a "-"/"+" sign says past/future in one character, there is little room
function formatAgoMsAxis(epochMs) {
	const deltaS = Math.round((Date.now() - epochMs) / 1000)
	return deltaS >= 0 ? `-${formatSeconds(deltaS)}` : `+${formatSeconds(-deltaS)}`
}
// "24000" -> "24k" so that the big numbers of the Y axis do not look like an illegible block of digits; non-integers get one
// decimal (floating point noise like 58.300000000000004). The tooltip uses formatValue, the axis this one.
function formatCompact(v) {
	if (Math.abs(v) >= 1000) {
		const k = v / 1000
		return (Number.isInteger(k) ? k : k.toFixed(1)) + 'k'
	}
	return Number.isInteger(v) ? `${v}` : v.toFixed(1)
}
// X axis in "N s ago" for the legacy mode (plain numbers): the last sample is "now", toward the left it grows into the past
function labels() {
	const n = props.history.length
	return props.history.map((_, i) => `-${formatSeconds(Math.round((n - 1 - i) * props.sampleIntervalS))}`)
}

// The Y range and the X window are set by hand on the chart options before every update. The Y axis is ALWAYS computed over the
// complete history (zooming only changes which time window is seen); the X ticks use a table of "nice" steps (1 s, 2 s, 5 s,
// 10 s, 30 s, 1 min...) chosen for the visible width, because the automatic step over raw epoch ms (~1.79e12) is not aligned
// to human seconds when the window is small.
function applyAxes() {
	if (!chart || !isTimed.value) return
	const x = chart.options.scales.x
	const y = chart.options.scales.y
	// Y
	const ys = props.history.map(p => p.y).filter(v => typeof v === 'number')
	if (props.limit != null && props.limit > 0) ys.push(props.limit)
	if (!ys.length) {
		delete y.min
		delete y.max
		y.beginAtZero = true
	} else {
		const maxY = Math.max(0, ...ys)
		const mode = scaleMode.value
		const pos = props.history.map(p => p.y).filter(v => v > 0)
		if (mode === 'log') {
			// minimum = power of 10 below the smallest POSITIVE value (zeros have no place on a log scale)
			const minPos = pos.length ? Math.min(...pos) : 1
			y.min = Math.pow(10, Math.floor(Math.log10(minPos)))
			y.max = maxY > 0 ? Math.max(roundUpNice(maxY * 1.1), y.min * 10) : 10
		} else if (mode === 'clip' && pos.length) {
			// without peaks: ceiling at the 90th percentile of the values (+30%); what goes beyond goes out above the chart
			const vals = pos.slice().sort((a, b) => a - b)
			const p90 = vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.9))]
			y.min = 0
			y.max = roundUpNice(Math.max(p90 * 1.3, 1e-6))
		} else {
			const range = linearRange(ys, props.zeroBased)
			y.min = range.min
			y.max = range.max
		}
	}
	// X window
	const w = currentWindow()
	if (w && (view || props.xMin != null)) {
		x.min = w.min
		x.max = w.max
	} else {
		delete x.min
		delete x.max
	}
	const hasWindow = x.min != null && x.max != null
	let minT, maxT
	if (hasWindow) {
		minT = x.min
		maxT = x.max
	} else if (props.history.length > 1) {
		minT = props.history[0].t
		maxT = props.history[props.history.length - 1].t
	} else {
		delete x.ticks.stepSize
		return
	}
	const rangeS = (maxT - minT) / 1000
	// how many labels fit: ~48 px per compact label of the "-1:23" kind
	const axisWidth = chart.chartArea ? chart.chartArea.right - chart.chartArea.left : 300
	const target = Math.min(7, Math.max(2, Math.floor(axisWidth / 48)))
	const stepsS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14400, 43200, 86400]
	let stepS = stepsS[stepsS.length - 1]
	for (const s of stepsS) {
		if (rangeS / s <= target) {
			stepS = s
			break
		}
	}
	x.ticks.stepSize = stepS * 1000
}

// ---- chart ----

function datasets() {
	const timed = isTimed.value
	const mainData = timed ? withGaps(props.history, props.gapMs) : props.history.slice()
	const sets = [{
		label: props.label || 'value',
		data: mainData,
		borderColor: props.color,
		backgroundColor: props.color + '22',
		borderWidth: 2,
		pointRadius: 0,
		pointHitRadius: 8,
		pointHoverRadius: 4,
		fill: true,
		// a Bezier overshoots on steps (0 -> 150 -> 0 drew values below 0 and above the maximum that never happened);
		// the monotone curve never leaves the range of the data
		cubicInterpolationMode: 'monotone',
		spanGaps: false
	}]
	if (props.limit != null && props.limit > 0) {
		sets.push({
			label: props.limitLabel,
			data: timed ? limitPoints() : props.history.map(() => props.limit),
			borderColor: props.limitColor,
			borderWidth: 1,
			borderDash: [5, 4],
			pointRadius: 0,
			pointHitRadius: 0,
			fill: false
		})
	}
	return sets
}
// the limit line from the left to the right end of the x range (two points, not one per sample)
function limitPoints() {
	const range = timeRange(props.history, props.xMin, props.xMax)
	if (!range) return props.history.map(p => ({ x: p.t, y: props.limit }))
	return [{ x: range.min, y: props.limit }, { x: range.max, y: props.limit }]
}
function chartOptions() {
	const unit = props.unit
	const timed = isTimed.value
	const tickFont = { size: 9 }
	const xAxis = timed
		? {
			type: 'linear',
			grid: { color: GRID },
			ticks: { font: tickFont, color: '#888888', maxTicksLimit: 8, autoSkip: true, maxRotation: 0, minRotation: 0, callback: v => formatAgoMsAxis(v) }
		}
		: {
			type: 'category',
			grid: { color: GRID },
			ticks: { font: tickFont, color: '#888888', maxTicksLimit: 8, autoSkip: true, maxRotation: 0, minRotation: 0 }
		}
	const isLog = scaleMode.value === 'log' && timed
	const yAxis = {
		type: isLog ? 'logarithmic' : 'linear',
		beginAtZero: !isLog,
		grid: { color: ctx => (ctx.tick && ctx.tick.value === 0 ? ZERO_LINE : GRID) },
		ticks: {
			font: tickFont,
			color: '#888888',
			maxTicksLimit: 5,
			// the unit is NOT repeated on each label (one fixed label above the chart): less text per tick. On log the 1, 2 and 5 of
			// each decade are labeled: Chart.js generates 1..9 and together they pile up, but only the powers of 10 left the axis
			// without numbers when the values fall inside a single decade.
			callback: v => (isLog && !isLogLabel(v) ? '' : formatCompact(v))
		}
	}
	return {
		responsive: true,
		maintainAspectRatio: false,
		animation: false, // real time: no animation, the chart must not "jump"
		interaction: { mode: 'index', intersect: false },
		plugins: {
			legend: { display: props.legend, position: 'top', labels: { boxWidth: 12, font: { size: 10 }, color: '#888888' } },
			tooltip: {
				mode: 'index',
				intersect: false,
				position: 'workshopVisible',
				callbacks: {
					label: ctx => `${ctx.dataset.label}: ${formatValue(Number(ctx.parsed.y))}${unit ? ' ' + unit : ''}`,
					title: items => {
						if (!items.length) return ''
						return timed ? formatAgoMs(Number(items[0].parsed.x)) : ts('chart_ago', { t: String(items[0].label).replace('-', '') })
					}
				}
			}
		},
		scales: { x: xAxis, y: yAxis }
	}
}
function build() {
	if (!canvas.value) return
	builtAsTimed = isTimed.value
	const data = { datasets: datasets() }
	if (!isTimed.value) data.labels = labels()
	chart = new Chart(canvas.value.getContext('2d'), { type: 'line', data, options: chartOptions() })
	applyAxes()
	chart.update('none')
	// a vertical swipe scrolls the page; a horizontal swipe pans the chart and a pinch zooms it (the browser's own pinch-zoom stays off)
	canvas.value.style.touchAction = 'pan-y'
}
function refresh() {
	if (!chart) {
		build()
		return
	}
	// While the person drags or pinches, do not touch the chart: its scale limits are the reference of the gesture, and a new
	// sample would shift them in the middle of it. props.history is already up to date, so endGesture() calls refresh() once more.
	if (interacting) return
	// The X scale type (category vs linear/real time) is decided in build(): if the component was mounted before the first sample
	// arrived (empty history) it got stuck in category, so it is rebuilt once as soon as {t, y} points arrive.
	if (builtAsTimed !== isTimed.value) {
		chart.destroy()
		build()
		return
	}
	// In-place update instead of recreating: it keeps the tooltip and the zoom (view), so each new sample (~1 s) does not reset it.
	if (!isTimed.value) chart.data.labels = labels()
	chart.data.datasets = datasets()
	applyAxes()
	chart.update('none')
	// If the mouse was still over the chart, re-fire the hover at the SAME screen position: without it the tooltip closes by
	// itself as soon as the new data come in.
	if (lastMouse && canvas.value) {
		canvas.value.dispatchEvent(new MouseEvent('mousemove', { clientX: lastMouse.clientX, clientY: lastMouse.clientY, bubbles: true }))
	}
}
</script>
<style scoped>
.detail-chart-wrap {
	position: relative;
	width: 100%;
	/*
	   2026-10-08 ("the chart keeps moving/scrolling when zooming
	   with the fingers"): without this, a pinch/drag gesture on
	   the canvas fires TWO things at once -- chartjs-plugin-zoom/Hammer.js's
	   own zoom/pan, AND the browser PAGE's native zoom/scroll
	   (the kiosk's Chromium) competing for the same touch.
	   The result looks as if "the whole chart moved" (it is actually
	   the page moving underneath). touch-action:none told the
	   browser not to touch that element with its own gestures,
	   leaving the whole touch to Hammer.js.
	   2026-10-21: pan-y instead (and on the canvas, see build()): with
	   none a finger on a chart could not scroll the page on a phone. The
	   browser keeps only the vertical scroll; the horizontal pan and the
	   pinch still go to Hammer (no browser pinch-zoom).
	*/
	touch-action: pan-y;
}
.detail-chart-unit {
	position: absolute;
	top: 2px;
	left: 4px;
	z-index: 2;
	font-size: 10px;
	color: var(--tp-faint, #9e9e9e);
	opacity: 0.85;
	pointer-events: none;
}
.detail-chart-nodata {
	position: absolute;
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 11px;
	opacity: 0.5;
	pointer-events: none;
}
.detail-chart-reset {
	position: absolute;
	top: 2px;
	right: 2px;
	z-index: 2;
	font-size: 10px;
	padding: 2px 8px;
	border-radius: 10px;
	border: 1px solid rgba(128,128,128,0.4);
	background: rgba(32,32,32,0.75);
	color: #e0e0e0;
	cursor: pointer;
}
.detail-chart-scale {
	position: absolute;
	bottom: 2px;
	left: 2px;
	z-index: 2;
	font-size: 9px;
	padding: 1px 6px;
	border-radius: 8px;
	border: 1px solid rgba(128,128,128,0.4);
	background: rgba(32,32,32,0.75);
	color: #cfd8dc;
	cursor: pointer;
	opacity: 0.85;
}
.detail-chart-hint {
	position: absolute;
	left: 50%;
	top: 40%;
	transform: translateX(-50%);
	z-index: 3;
	font-size: 11px;
	padding: 4px 10px;
	border-radius: 6px;
	background: rgba(32, 32, 32, 0.85);
	color: #eceff1;
	pointer-events: none;
	white-space: nowrap;
}
.detail-chart-reset:hover {
	background: rgba(64,64,64,0.9);
}
</style>
