<template>
	<div class="detail-chart-wrap" :style="{ height: height + 'px' }">
		<div v-if="unit" class="detail-chart-unit">{{ unit }}</div>
		<canvas ref="canvas"></canvas>
		<button
			v-if="isZoomed" type="button" class="detail-chart-reset"
			:title="ts('chart_reset_zoom_title')" @click="resetZoom"
		><v-icon x-small class="mr-1">mdi-magnify-minus-outline</v-icon>{{ ts('chart_reset_zoom') }}</button>
		<button
			v-if="isTimed" type="button" class="detail-chart-scale"
			:title="scaleTitles[scaleMode]" @click="cycleScale"
		>{{ scaleLabels[scaleMode] }}</button>
		<div v-if="history.length < 2" class="detail-chart-nodata">{{ ts('chart_waiting') }}</div>
		<div v-if="wheelHint" class="detail-chart-hint">{{ ts('chart_wheel_hint') }}</div>
	</div>
</template>

<script>
'use strict'

import Vue from 'vue'
import Chart from 'chart.js'
import { zoomPlugins } from './zoom-plugin.js' // the zoom plugin only for the charts of this component (see zoom-plugin.js)
import Hammer from 'hammerjs'
import { ts } from './shared-t.js'
import { withGaps, timeRange, formatValue, linearRange } from './chart-data.js'

// chartjs-plugin-zoom 0.7.x looks for the Hammer constructor in the global
// -- without this, touch pan/zoom (kiosk screen) does not
// work, although mouse-wheel zoom does.
if (typeof window !== 'undefined' && !window.Hammer) {
	window.Hammer = Hammer;
}

// "26400.0000004" -> "27000" -- rounds up to 2 significant
// figures. Used for the Y axis ceiling when zooming (see
// recomputeYRange): it gives a clean margin over the nearest "nice"
// tick that Chart.js generates by itself, instead of a raw value that sometimes
// falls right on that tick and the two labels overlap.
// Y axis scale (2026-10-08): during a live cut 91% of the
// time goes at ~6 mm/s and the travels at ~385 mm/s -- in linear the cutting
// line ended up glued to the floor. Three modes, changed with the chart's
// button and remembered on THIS screen (all the charts together).
const SCALE_KEY = 'workshopChartScale';
const SCALE_MODES = ['lin', 'log', 'clip'];

// Escala log: rotular los ticks cuya mantisa es 1, 2 o 5 (1, 2, 5, 10, 20, 50...).
function isLogLabel(v) {
	if (!(v > 0)) {
		return false;
	}
	const m = v / Math.pow(10, Math.floor(Math.log10(v) + 1e-9));
	return [1, 2, 5].some(k => Math.abs(m - k) < 1e-6);
}
// Tooltip position (2026-10-09, "when changing the scale in the current
// charts the tooltip no longer shows anything"): with mode 'index' the tooltip
// includes ALL the datasets, also the limit line (2700 mA) and the
// peaks that in "no peaks" fall outside the axis. Chart.js's 'average'
// positioner averages those points -> y = -98000 px, box drawn outside the
// canvas. This one averages only the visible points and stays inside the area.
Chart.Tooltip.positioners.workshopVisible = function (elements, eventPosition) {
	if (!elements.length) {
		return false;
	}
	const area = this._chart.chartArea;
	const inside = elements.map(e => e.tooltipPosition())
		.filter(p => p.y >= area.top && p.y <= area.bottom);
	const pts = inside.length ? inside : elements.map(e => e.tooltipPosition());
	const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
	const y = inside.length ? pts.reduce((s, p) => s + p.y, 0) / pts.length : eventPosition.y;
	return {
		x: Math.min(Math.max(x, area.left), area.right),
		y: Math.min(Math.max(y, area.top), area.bottom)
	};
};

// A single mode for ALL the charts on the screen: tapping the button on
// one changes them all (reactive, shared between instances).
const scaleStore = Vue.observable({ mode: 'lin' });
try {
	const saved = localStorage.getItem(SCALE_KEY);
	if (SCALE_MODES.includes(saved)) {
		scaleStore.mode = saved;
	}
} catch (e) {
	/* sin localStorage: lineal */
}

function roundUpNice(v) {
	if (v <= 0) {
		return 1;
	}
	const magnitude = Math.pow(10, Math.floor(Math.log10(v)) - 1);
	return Math.ceil(v / magnitude) * magnitude;
}

export default {
	name: 'DetailChart',
	props: {
		// Each item can be a plain number (old mode -- X axis by
		// index/relative position, "-30s" etc, used by pages that
		// have not migrated yet) or an object {t, y} with t = real epoch ms
		// (new mode -- real-time X axis, needed so that
		// zoom/pan does not "jump" every time a new sample arrives, see
		// the 2026-10-07 note below).
		history: { type: Array, required: true },
		label: { type: String, default: '' },
		color: { type: String, default: '#42A5F5' },
		unit: { type: String, default: '' },
		height: { type: Number, default: 160 },
		// Horizontal reference line (e.g. the limit configured by M203)
		// -- drawn as a second flat, dotted dataset.
		limit: { type: Number, default: null },
		limitLabel: { type: String, default: 'limit' },
		sampleIntervalS: { type: Number, default: 1 },
		// 2026-10-21 (Motors charts audit, docs-internal/MOTORES-DISENO.md 4):
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
	},
	data() {
		return {
			chart: null, isZoomed: false, _interacting: false, engaged: false, wheelHint: false,
			scaleLabels: { lin: ts('chart_scale_linear'), log: ts('chart_scale_log'), clip: ts('chart_scale_clip') },
			scaleTitles: { lin: ts('chart_scale_linear_title'), log: ts('chart_scale_log_title'), clip: ts('chart_scale_clip_title') }
		};
	},
	computed: {
		// New mode: each item is {t: epochMs, y: value}. Old mode
		// (compatibility with pages that still pass plain numbers):
		// the usual index axis is still supported.
		scaleMode() {
			return scaleStore.mode;
		},
		isTimed() {
			const first = this.history[0];
			return !!first && typeof first === 'object' && 't' in first;
		}
	},
	watch: {
		history: {
			deep: true,
			handler() {
				this.refresh();
			}
		},
		limit() {
			this.refresh();
		},
		xMax() {
			this.refresh();
		},
		// The scale TYPE (linear/logarithmic) cannot be changed with
		// update(): the chart is rebuilt (the horizontal zoom is lost).
		scaleMode() {
			if (this.chart) {
				this.chart.destroy();
				this.chart = null;
			}
			this.isZoomed = false;
			this.build();
		}
	},
	mounted() {
		this.build();
		// Track the mouse position on our own (besides Chart.js's
		// internal listeners) to be able to "re-fire" the hover
		// on the same point after each refresh() -- without this, the
		// tooltip closes by itself every time a new sample arrives
		// (every ~1s), because Chart.js replaces the data and loses the
		// active hover.
		this.$refs.canvas.addEventListener('mousemove', this.onCanvasMouseMove);
		this.$refs.canvas.addEventListener('mouseleave', this.onCanvasMouseLeave);
		// Ctrl+wheel (and the touchpad pinch, which arrives the same) is Chrome's
		// zoom: cut it before it reaches the chart's zoom plugin,
		// which consumed it with preventDefault and the page did not scale.
		this.$el.addEventListener('wheel', this.onCtrlWheel, true);
		this.$el.addEventListener('mousedown', this.onEngage);
		this.$el.addEventListener('touchstart', this.onEngage, { passive: true });
		this.$el.addEventListener('mouseleave', this.onRelease);
	},
	beforeDestroy() {
		if (this.$el) {
			this.$el.removeEventListener('wheel', this.onCtrlWheel, true);
			this.$el.removeEventListener('mousedown', this.onEngage);
			this.$el.removeEventListener('touchstart', this.onEngage);
			this.$el.removeEventListener('mouseleave', this.onRelease);
		}
		clearTimeout(this._hintTimer);
		if (this.$refs.canvas) {
			this.$refs.canvas.removeEventListener('mousemove', this.onCanvasMouseMove);
			this.$refs.canvas.removeEventListener('mouseleave', this.onCanvasMouseLeave);
		}
		if (this.chart) {
			this.chart.destroy();
			this.chart = null;
		}
	},
	methods: {
		ts, // texts of the shared pieces (shared-t.js)
		cycleScale() {
			scaleStore.mode = SCALE_MODES[(SCALE_MODES.indexOf(scaleStore.mode) + 1) % SCALE_MODES.length];
			try {
				localStorage.setItem(SCALE_KEY, scaleStore.mode);
			} catch (e) {
				/* no critico */
			}
		},
		onCanvasMouseMove(evt) {
			this._lastMouse = { clientX: evt.clientX, clientY: evt.clientY };
		},
		// 2026-10-21: scrolling a page with many charts zoomed the chart under the pointer instead of scrolling the page.
		// The wheel zooms a chart only after a click or a tap on it (until the pointer leaves); before that it scrolls the
		// page and a short hint says how to zoom. Ctrl+wheel (and the touchpad pinch) stays the browser's zoom.
		onCtrlWheel(ev) {
			if (ev.ctrlKey || ev.metaKey) {
				ev.stopPropagation();
				return;
			}
			if (!this.engaged) {
				ev.stopPropagation();
				this.wheelHint = true;
				clearTimeout(this._hintTimer);
				this._hintTimer = setTimeout(() => { this.wheelHint = false; }, 1500);
			}
		},
		onEngage() {
			this.engaged = true;
			this.wheelHint = false;
		},
		onRelease() {
			this.engaged = false;
		},
		onCanvasMouseLeave() {
			this._lastMouse = null;
		},
		resetZoom() {
			if (this.chart) {
				// We clear our own min/max besides calling the plugin's
				// resetZoom() (2026-10-08, "the reset button does not
				// work well"): we must not trust that the plugin's internal
				// snapshot (chart.$zoom._originalOptions, taken the
				// first time zoom/pan was done) is still the real "no zoom"
				// state -- forcing the same path that recomputeYRange/
				// recomputeXStep already use when there is no active window leaves the
				// chart exactly as it would look if zoom had never been
				// done.
				const xTicks = this.chart.options.scales.xAxes[0].ticks;
				const yTicks = this.chart.options.scales.yAxes[0].ticks;
				if (this.chart.resetZoom) {
					this.chart.resetZoom();
				}
				delete xTicks.min;
				delete xTicks.max;
				delete xTicks.stepSize;
				delete yTicks.min;
				delete yTicks.max;
				this.isZoomed = false;
				this.chart.update(0);
			}
			this.isZoomed = false;
		},
		// BUG found 2026-10-07 ("the chart moves and loses the
		// scale when zooming"): the Y axis never had a fixed min/max, so
		// Chart.js autoscaled it against ALL of this.history (600
		// points) on every update() -- also those that were outside
		// the zoomed window. Result: with the X zoom/pan fixed on
		// an old window, the Y axis (and therefore the shape of the
		// curve) kept rearranging every time a new sample arrived at the
		// "live" edge, even though that sample was not even seen.
		// Fix: when there is an active zoom (X axis with ticks.min/max set
		// by chartjs-plugin-zoom), recompute by hand the Y axis ceiling
		// only with the points INSIDE that window. It is called from an
		// own beforeUpdate hook of this instance (see build()) --
		// it runs on EVERY update(), whether from refresh() of data or from the
		// plugin's own zoom/pan, so it always sees the most recent ticks.min/max
		// before Chart.js computes the frame's scale.
		recomputeYRange(ci) {
			if (!this.isTimed) {
				return;
			}
			const yTicks = ci.options.scales.yAxes[0].ticks;
			// 2026-10-08 ("when zooming the Y axis shrinks, e.g. from 4kHz to
			// 400, and reset does not return it to its place"): the previous version
			// scaled the Y axis only against the points INSIDE the zoom window --
			// well-intentioned (see bug 2026-10-07 below), but the
			// side effect (zooming into a quiet zone "shrank" the
			// whole chart, and the reset did not feel complete because the Y axis
			// stayed different) turned out worse than the problem it fixed. This
			// component's zoom/pan is HORIZONTAL ONLY (mode: 'x' in
			// options() below), so the Y axis is now ALWAYS computed
			// over the complete history, without looking at the X window -- zooming
			// no longer changes the vertical scale at all, only which time
			// window is seen. The Y axis can still grow/shrink over
			// time (new real data / old data leaving the buffer), but that
			// is no longer tied to whether you are zooming or not.
			const ys = this.history.map(p => p.y).filter(v => typeof v === 'number');
			if (this.limit != null && this.limit > 0) {
				ys.push(this.limit);
			}
			if (!ys.length) {
				delete yTicks.min;
				delete yTicks.max;
				yTicks.beginAtZero = true;
				return;
			}
			const maxY = Math.max(0, ...ys);
			if (this.scaleMode === 'log') {
				// log: minimum = power of 10 below the smallest POSITIVE value
				// (zeros have no place on a log scale)
				const pos = this.history.map(p => p.y).filter(v => v > 0);
				const minPos = pos.length ? Math.min(...pos) : 1;
				yTicks.min = Math.pow(10, Math.floor(Math.log10(minPos)));
				yTicks.max = maxY > 0 ? Math.max(roundUpNice(maxY * 1.1), yTicks.min * 10) : 10;
				return;
			}
			if (this.scaleMode === 'clip') {
				// without peaks: ceiling at the 90th percentile of the values (+30%); what
				// goes beyond that goes out above the chart
				const vals = this.history.map(p => p.y).filter(v => v > 0).sort((a, b) => a - b);
				if (vals.length) {
					const p90 = vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.9))];
					yTicks.min = 0;
					yTicks.max = roundUpNice(Math.max(p90 * 1.3, 1e-6));
					return;
				}
			}
			// Rounded 2026-10-08 ("sometimes two Y axis labels end up glued"): the top goes up to 2 significant figures
			// (chart-data.js niceCeil). 2026-10-21: zeroBased false fits the axis to the data (linearRange).
			const range = linearRange(ys.filter(v => v !== null), this.zeroBased);
			yTicks.min = range.min;
			yTicks.max = range.max;
		},
		// BUG found 2026-10-07 ("when zooming the time axis
		// shows many things, it creates noise"): the X axis is "linear" type
		// over raw epoch-ms (not a real Chart.js "time" axis), so
		// its automatic tick generator picks the "nice step"
		// looking at the raw millisecond range -- with numbers that
		// big (~1.79e12) that calculation's rounding does not give steps
		// aligned to "human" seconds/minutes when zooming into a small
		// window, and more ticks end up appearing than
		// maxTicksLimit should allow. Fix: we choose a
		// stepSize in ms ourselves from a table of "nice" steps (1s, 2s, 5s,
		// 10s, 30s, 1m, ...) according to the visible window's width, the same
		// as recomputeYRange does with the Y axis ceiling -- same
		// beforeUpdate hook, same logic of "only if zoom/pan is active".
		recomputeXStep(ci) {
			if (!this.isTimed) {
				return;
			}
			const xTicks = ci.options.scales.xAxes[0].ticks;
			// Unified 2026-10-08, same reason as recomputeYRange above:
			// without this, the X axis went from Chart.js's "raw" tick generator
			// (without zoom) to this table of "nice" steps (with zoom) at
			// the exact instant the zoom started, changing the width
			// of the labels and shifting the chartArea -- another cause of the
			// jump. Now the same table is always used, over the visible window
			// if there is active zoom/pan or over the complete history if
			// not.
			if (!this.isZoomed) {
				const range = timeRange(this.history, this.xMin, this.xMax);
				if (range && this.xMin != null) {
					xTicks.min = range.min;
					xTicks.max = range.max;
				}
			}
			const hasWindow = xTicks.min != null && xTicks.max != null;
			let minT, maxT;
			if (hasWindow) {
				minT = xTicks.min;
				maxT = xTicks.max;
			} else if (this.history.length > 1) {
				minT = this.history[0].t;
				maxT = this.history[this.history.length - 1].t;
			} else {
				delete xTicks.stepSize;
				return;
			}
			const rangeS = (maxT - minT) / 1000;
			// Adapted 2026-10-08 ("since the X axis is so small not that many
			// labels fit, when you detect it is going to overflow reduce the
			// number"): before the target of 7 ticks was fixed, without looking at
			// the real width of the chart -- in Motors' narrow charts (~500px)
			// that is enough to squeeze the labels. Now
			// it is computed how many labels fit according to the real width of the
			// chart area (chartArea, available after the first
			// layout), with ~48px per compact label of the "-1:23" kind.
			const axisWidth = ci.chartArea ? (ci.chartArea.right - ci.chartArea.left) : 300;
			const maxFit = Math.max(2, Math.floor(axisWidth / 48));
			const target = Math.min(7, maxFit);
			const stepsS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14400, 43200, 86400];
			let stepS = stepsS[stepsS.length - 1];
			for (const s of stepsS) {
				if (rangeS / s <= target) {
					stepS = s;
					break;
				}
			}
			xTicks.stepSize = stepS * 1000;
		},
		// "125" -> "2:05", "45" -> "45s" -- compact format for the X axis,
		// which otherwise looks ugly as soon as the history exceeds 60 samples
		// (labels of 3+ digits like "-120s" instead of "-2:00"). For long
		// ranges (Consumption.vue's trend chart with up to 7
		// days of history) it goes up to hours/days -- before it stayed at
		// minutes:seconds without limit and showed things like "-1277:43"
		// (bug found 2026-10-07, "long numbers" on the axis).
		formatSeconds(totalS) {
			const sign = totalS < 0 ? '-' : '';
			totalS = Math.abs(totalS);
			if (totalS < 60) {
				return `${sign}${totalS}s`;
			}
			if (totalS < 3600) {
				const m = Math.floor(totalS / 60);
				const s = totalS % 60;
				return `${sign}${m}:${String(s).padStart(2, '0')}`;
			}
			if (totalS < 86400) {
				const h = Math.floor(totalS / 3600);
				const m = Math.floor((totalS % 3600) / 60);
				return `${sign}${h}h${m ? ' ' + m + 'm' : ''}`;
			}
			const d = Math.floor(totalS / 86400);
			const h = Math.floor((totalS % 86400) / 3600);
			return `${sign}${d}d${h ? ' ' + h + 'h' : ''}`;
		},
		// epoch ms -> "hace 2:05" / "en 0:03" (pan toward the future should
		// not happen, but in case the browser's clock and the backend's
		// are not perfectly in sync).
		formatAgoMs(epochMs) {
			const deltaS = Math.round((Date.now() - epochMs) / 1000);
			return deltaS >= 0 ? ts('chart_ago', { t: this.formatSeconds(deltaS) }) : ts('chart_ahead', { t: this.formatSeconds(-deltaS) });
		},
		// Compact version of formatAgoMs only for the axis LABELS
		// (the tooltip says "N ago" in words, ts('chart_ago'): there is plenty of room there).
		// Bug reported 2026-10-08: in Motors' narrow charts
		// "hace " (5 characters) leaves no room for several labels at
		// once -- a "-"/"+" sign says the same (past/future) in a single
		// character.
		formatAgoMsAxis(epochMs) {
			const deltaS = Math.round((Date.now() - epochMs) / 1000);
			return deltaS >= 0 ? `-${this.formatSeconds(deltaS)}` : `+${this.formatSeconds(-deltaS)}`;
		},
		// "24000" -> "24k" -- so that the big numbers of the Y axis
		// (Hz, mm/min) do not look like an illegible block of digits.
		formatCompact(v) {
			// 2026-10-09 ("always keep the values simplified
			// using prefixes, even when zooming"): the "k" abbreviation
			// for numbers >= 1000 (26400 -> "26.4k") stays ALWAYS
			// active, regardless of the zoom state -- the Y axis no longer
			// depends on the zoom window at all (see recomputeYRange
			// below), so the format should not either. The problem
			// of 2026-10-08 ("the axes go from 26k to 27000") was NOT that
			// the axis abbreviated wrongly -- it was that the TOOLTIP (see options()
			// below) showed the raw unabbreviated number while the
			// axis did abbreviate. The correct fix: the tooltip now uses this
			// same function, instead of removing the abbreviation from the axis.
			const abs = Math.abs(v);
			if (abs >= 1000) {
				const k = v / 1000;
				return (Number.isInteger(k) ? k : k.toFixed(1)) + 'k';
			}
			// BUG found 2026-10-07 ("super long numbers on the Y
			// axis"): without rounding, a number like 58.300000000000004
			// (floating point noise from yTicks.max = maxY * 1.1 in
			// recomputeYRange) was painted as is on the axis -- hence the
			// toFixed(1) for non-integers.
			return Number.isInteger(v) ? `${v}` : v.toFixed(1);
		},
		// X axis in "N s ago" (formatted): the last sample is "now" and
		// toward the left it grows into the past, at sampleIntervalS per
		// sample. Only used in old mode (plain numbers).
		labels() {
			const n = this.history.length;
			return this.history.map((_, i) => `-${this.formatSeconds(Math.round((n - 1 - i) * this.sampleIntervalS))}`);
		},
		datasets() {
			const timed = this.isTimed;
			const mainData = timed ? withGaps(this.history, this.gapMs) : this.history.slice();
			const sets = [{
				label: this.label || 'value',
				data: mainData,
				borderColor: this.color,
				backgroundColor: this.color + '22',
				borderWidth: 2,
				pointRadius: 0,
				pointHitRadius: 8,
				pointHoverRadius: 4,
				fill: true,
				// 2026-10-21: a Bezier (lineTension) overshoots on steps (0 -> 150 -> 0 drew values below 0 and above the
				// maximum that never happened); the monotone curve never leaves the range of the data
				cubicInterpolationMode: 'monotone',
				spanGaps: false
			}];
			if (this.limit != null && this.limit > 0) {
				sets.push({
					label: this.limitLabel,
					data: timed ? this.limitPoints() : this.history.map(() => this.limit),
					borderColor: this.limitColor,
					borderWidth: 1,
					borderDash: [5, 4],
					pointRadius: 0,
					pointHitRadius: 0,
					fill: false
				});
			}
			return sets;
		},
		options() {
			const unit = this.unit;
			const timed = this.isTimed;
			const xAxis = timed ? {
				type: 'linear',
				gridLines: { color: 'rgba(128,128,128,0.15)', zeroLineColor: 'rgba(128,128,128,0.25)' },
				ticks: {
					fontSize: 9, fontColor: '#888888',
					// maxRotation AND minRotation at 0 (2026-10-08, "the X axes
					// keep going diagonal"): with only maxRotation:0
					// Chart.js in theory should no longer rotate anything, but setting
					// minRotation:0 too removes any margin for the internal
					// rotation search to start at another angle.
					maxTicksLimit: 8, autoSkip: true, maxRotation: 0, minRotation: 0,
					callback: v => this.formatAgoMsAxis(v)
				}
			} : {
				gridLines: { color: 'rgba(128,128,128,0.15)', zeroLineColor: 'rgba(128,128,128,0.25)' },
				ticks: {
					fontSize: 9, fontColor: '#888888',
					maxTicksLimit: 8, autoSkip: true, maxRotation: 0, minRotation: 0
				}
			};
			const isLog = this.scaleMode === 'log' && timed;
			const yAxis = {
				type: isLog ? 'logarithmic' : 'linear',
				gridLines: { color: 'rgba(128,128,128,0.15)', zeroLineColor: 'rgba(128,128,128,0.25)' },
				ticks: {
					beginAtZero: !isLog,
					fontSize: 9, fontColor: '#888888',
					maxTicksLimit: 5,
					// 2026-10-08: the unit is NO LONGER repeated on each
					// label (see .detail-chart-unit in the template,
					// a single fixed label above the chart) -- less
					// text per tick helps them fit without rotating.
					// On log the 1, 2 and 5 of each decade are labeled (1, 2, 5, 10, 20,
					// 50...): Chart.js generates 1..9 and all together they pile up,
					// but only the powers of 10 left the axis WITHOUT numbers when
					// the values fall inside a single decade (e.g. current
					// 1000..2100 mA -- reported 2026-10-08).
					callback: v => (isLog && !isLogLabel(v) ? '' : this.formatCompact(v))
				}
			};
			// Own copy (Chart.js clones the options when building): used by
			// reassertAxes() to undo what the zoom plugin overwrites.
			this._axisCfg = {
				x: { ticks: Object.assign({}, xAxis.ticks), gridLines: Object.assign({}, xAxis.gridLines) },
				y: { ticks: Object.assign({}, yAxis.ticks), gridLines: Object.assign({}, yAxis.gridLines) }
			};
			return {
				responsive: true,
				maintainAspectRatio: false,
				animation: { duration: 0 },     // tiempo real: sin animacion, no "salta"
				legend: {
					display: this.legend,
					position: 'top',
					labels: { boxWidth: 12, fontSize: 10, fontColor: '#888888' }
				},
				tooltips: {
					mode: 'index',
					intersect: false,
					position: 'workshopVisible',
					callbacks: {
						label: (item, data) => {
							const name = data.datasets[item.datasetIndex].label;
							return `${name}: ${formatValue(Number(item.yLabel))}${unit ? ' ' + unit : ''}`;
						},
						title: items => {
							if (!items.length) {
								return '';
							}
							return timed ? this.formatAgoMs(Number(items[0].xLabel)) : ts('chart_ago', { t: String(items[0].xLabel).replace('-', '') });
						}
					}
				},
				hover: { mode: 'index', intersect: false },
				// chartjs-plugin-zoom 0.7.x (compatible with Chart.js 2.x) reads
				// the zoom/pan config from options.plugins.zoom.{pan,zoom} --
				// confirmed against its own README, the root-level location
				// (options.pan/options.zoom) does NOT fire the onZoom/onPan
				// callbacks even though the zoom itself works via some
				// internal fallback (found live 2026-10-07: the "reset zoom"
				// button never appeared). Mouse wheel + pinch
				// = horizontal zoom, drag = scroll forward/back.
				plugins: {
					zoom: {
						pan: {
							enabled: true,
							mode: 'x',
							// _interacting: see the big note in refresh() -- it freezes the
							// refreshes for new data while the gesture lasts, and on
							// release refresh() is called once more to catch up.
							onPan: () => { this.isZoomed = true; this._interacting = true; },
							onPanComplete: () => { this._interacting = false; this.refresh(); }
						},
						zoom: {
							enabled: true,
							mode: 'x',
							speed: 0.08,
							sensitivity: 3,
							onZoom: () => { this.isZoomed = true; this._interacting = true; },
							onZoomComplete: () => { this._interacting = false; this.refresh(); }
						}
					}
				},
				scales: {
					xAxes: [xAxis],
					yAxes: [yAxis]
				}
			};
		},
		// BUG 2026-10-08 ("when zooming or moving the axis values change,
		// they must be shown with suffixes"): reproduced live -- at the
		// first zoom/pan, chartjs-plugin-zoom 0.7.x leaves the options of
		// BOTH axes (even if the mode is only 'x') with Chart.js's default
		// values: the formatCompact callback is lost (3k ->
		// 3000), fontSize, maxTicksLimit and maxRotation (X axis
		// labels diagonal). Fix: reassert our ticks/gridLines config on
		// every beforeUpdate. min/max/stepSize are not in the base config,
		// so the plugin's zoom/pan and recomputeYRange/XStep are respected.
		reassertAxes(ci) {
			const cfg = this._axisCfg;
			if (!cfg) {
				return;
			}
			[['xAxes', cfg.x], ['yAxes', cfg.y]].forEach(([key, base]) => {
				const sc = ci.options.scales[key] && ci.options.scales[key][0];
				if (!sc) {
					return;
				}
				sc.ticks = Object.assign(sc.ticks || {}, base.ticks);
				sc.gridLines = Object.assign(sc.gridLines || {}, base.gridLines);
			});
		},
		// the limit line from the left to the right end of the x range (two points, not one per sample)
		limitPoints() {
			const range = timeRange(this.history, this.xMin, this.xMax);
			if (!range) {
				return this.history.map(p => ({ x: p.t, y: this.limit }));
			}
			return [{ x: range.min, y: this.limit }, { x: range.max, y: this.limit }];
		},
		build() {
			if (!this.$refs.canvas) {
				return;
			}
			this._builtAsTimed = this.isTimed;
			const chartData = { datasets: this.datasets() };
			if (!this.isTimed) {
				chartData.labels = this.labels();
			}
			this.chart = new Chart(this.$refs.canvas.getContext('2d'), {
				type: 'line',
				data: chartData,
				options: this.options(),
				// Root-caused 2026-10-07 by reading node_modules/chart.js/dist/Chart.js
				// directly (the earlier attempts to fix this by
				// mutating scale.ticks/ticksAsNumbers in beforeDraw did NOT
				// work on the real pixels, only on the JS object --
				// confirmed via CDP on the Pi with real screenshots). The
				// real cause: Scale.update() builds scale._ticksToDraw (an
				// array of objects {value, label, ...}, not strings) and caches
				// scale._labelItems from that during the layout; Chart.js
				// explicitly documents "after this point we
				// consider that this.ticks will NEVER change" (see its
				// own comment in Scale.update()). _drawLabels() reads
				// scale._labelItems (the cache), NEVER scale.ticks -- so
				// mutating scale.ticks after update() could never reach the
				// screen, whatever happened with the real callback.
				// Correct fix: rewrite the .label of each tick in
				// scale._ticksToDraw (that one IS read by _computeLabelItems) and
				// delete the scale._labelItems cache so it is recomputed
				// with the already corrected labels before painting.
				plugins: [...zoomPlugins(), {
					beforeUpdate: ci => {
						this.reassertAxes(ci);
						this.recomputeYRange(ci);
						this.recomputeXStep(ci);
					},
					beforeDraw: ci => {
						// Only the X axis is rewritten here -- the Y axis used the SAME
						// formatCompact already configured in scales.yAxes[0].ticks.callback
						// above, so this second pass was pure redundancy
						// (same text, two paths). 2026-10-08 ("when moving [pan] the
						// Y axis values look cut off" in narrow charts like
						// Motors' current ones): ticks.callback runs INSIDE
						// scale.update()/fit(), so Chart.js reserves the Y axis width
						// already knowing the final text -- but this manual relabel
						// happened AFTER that width reservation (in beforeDraw), so
						// if the visible value changed to a longer text between the
						// fit() and the draw() (typical when panning, where recomputeYRange
						// runs on every frame), the new text was drawn wider than the
						// reserved space and went out of the canvas on the left --
						// it looked "cut off". The X axis DOES need this mechanism because
						// formatAgoMsAxis depends on Date.now() (it has to be refreshed on
						// every draw(), not just on every update() with new data) -- the
						// Y axis is a pure function of the value, it does not have that problem.
						if (!this._builtAsTimed) {
							return;
						}
						const xScale = ci.scales && ci.scales['x-axis-0'];
						if (xScale && xScale._ticksToDraw) {
							xScale._ticksToDraw.forEach(t => {
								t.label = this.formatAgoMsAxis(t.value);
							});
							delete xScale._labelItems;
						}
					}
				}]
			});
			// 2026-10-21: the zoom plugin's Hammer sets touch-action: none on the canvas, so on a phone a finger on a chart
			// could not scroll the page. pan-y: a vertical swipe scrolls the page; a horizontal swipe pans the chart and a
			// pinch zooms it (the browser's own pinch-zoom stays off, as before).
			this.$refs.canvas.style.touchAction = 'pan-y';
		},
		refresh() {
			if (!this.chart) {
				this.build();
				return;
			}
			// 2026-10-08 ("the Motors chart keeps moving when
			// zooming"): in a LIVE chart (Motors, poll every ~1s) the user
			// may be in the middle of a pinch/pan gesture when a new
			// sample arrives -- that chart.update(0) below is not harmless:
			// chartjs-plugin-zoom reads the CURRENT scale.min/scale.max (the ones
			// left by that update) as the reference to compute the NEXT step
			// of the gesture (pinch center, drag delta). If those
			// limits change in the middle of the gesture because of a new datum (not
			// because of the gesture itself), the next pinch/drag step computes
			// its reference wrongly and the whole chart "jumps". Fix: while the
			// user is interacting (see _interacting, set from the
			// onZoom/onPan/onZoomComplete/onPanComplete callbacks in options()
			// below) do not touch the chart -- this.history is already up to date
			// (the parent mutated the array), so as soon as the gesture ends
			// (onZoomComplete/onPanComplete) refresh() is called once more
			// to catch up with what was missed in the meantime.
			if (this._interacting) {
				return;
			}
			// The X scale type (category vs linear/real time) is decided
			// only once in build(), according to isTimed at THAT moment -- if the
			// component was mounted before the first sample arrived
			// (empty history), isTimed gave false and it got stuck in
			// category forever even if {t,y} points DO arrive later.
			// If the mode changed since the chart was built, it has to
			// be recreated (once, as soon as the first real datum arrives) -- the
			// "type" of an already built scale cannot be changed with
			// update().
			if (this._builtAsTimed !== this.isTimed) {
				this.chart.destroy();
				this.build();
				return;
			}
			// In-place update() instead of recreating: it keeps the tooltip AND the
			// user's zoom/pan (chartjs-plugin-zoom stores its state
			// as the scale's min/max, which update() does not touch if we do not
			// reassign them here) -- without this, each new sample (~1s)
			// would reset the zoom, which is exactly the complaint that motivated
			// this change (2026-10-07): "the chart moves" every time
			// a datum arrives. In "timed" mode (X axis = real epoch ms) the
			// old points do not change position when adding a new one, so
			// a view shifted/zoomed into the past stays still.
			if (!this.isTimed) {
				this.chart.data.labels = this.labels();
			}
			this.chart.data.datasets = this.datasets();
			this.chart.update(0);
			// If the mouse was still over the chart, re-fire the hover at
			// the SAME screen position -- without this the tooltip closes
			// by itself as soon as the new data come in (annoying if a value
			// was just being looked at).
			if (this._lastMouse && this.$refs.canvas) {
				this.$refs.canvas.dispatchEvent(new MouseEvent('mousemove', {
					clientX: this._lastMouse.clientX,
					clientY: this._lastMouse.clientY,
					bubbles: true
				}));
			}
		}
	}
};
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
