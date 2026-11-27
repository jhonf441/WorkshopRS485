'use strict'

// What DetailChart.vue draws, as pure functions (tests/chart-data.test.js): the line cut where the data stopped, the
// time window, the precision of a value in the tooltip and the colors of the charts (DESIGN.md + the validated
// categorical palette: slot 1 blue for the series, a neutral grey for reference lines).

// [{t, y}] -> [{x, y}] with a {x, y: null} point between two samples farther apart than gapMs: Chart.js does not join
// the line across a null (spanGaps false), so a silence (service stopped, page closed, supply off) is a visible gap
// instead of a straight ramp that was never measured. gapMs null / 0: no cuts.
export function withGaps(points, gapMs) {
	const out = [];
	let prev = null;
	for (const p of points || []) {
		if (!p || typeof p.t !== 'number') {
			continue;
		}
		if (gapMs > 0 && prev && p.t - prev.t > gapMs) {
			out.push({ x: prev.t + (p.t - prev.t) / 2, y: null });
		}
		out.push({ x: p.t, y: p.y });
		prev = p;
	}
	return out;
}

// The x range of a time chart without zoom: [xMin, xMax] given by the page (a window that ends now, the same for every
// chart of the page) or else the range of the data. null when there is nothing to show.
export function timeRange(points, xMin, xMax) {
	if (typeof xMin === 'number' && typeof xMax === 'number' && xMax > xMin) {
		return { min: xMin, max: xMax };
	}
	const ts = (points || []).map(p => p && p.t).filter(t => typeof t === 'number');
	return ts.length > 1 ? { min: Math.min(...ts), max: Math.max(...ts) } : null;
}

// A value with the precision it deserves in the tooltip: 2700 -> '2700', 85.34 -> '85.3', 0.042 -> '0.04', 0 -> '0'
export function formatValue(v) {
	if (typeof v !== 'number' || !isFinite(v)) {
		return '--';
	}
	const a = Math.abs(v);
	if (a < 0.005) {
		return '0';
	}
	const d = a >= 100 ? 0 : (a >= 1 ? 1 : 2);
	return String(Number(v.toFixed(d)));
}

// The y range of a linear axis: from 0 (most magnitudes) or around the data (a voltage of 24 V: a sag of 1 V must show).
// values: the y of the points (and the limit, if any). -> { min, max }
export function linearRange(values, zeroBased) {
	const ys = (values || []).filter(v => typeof v === 'number' && isFinite(v));
	if (!ys.length) {
		return { min: 0, max: 1 };
	}
	let lo = Math.min(...ys);
	let hi = Math.max(...ys);
	if (zeroBased !== false) {
		return { min: Math.min(0, lo), max: hi > 0 ? niceCeil(hi * 1.1) : 1 };
	}
	const pad = Math.max((hi - lo) * 0.1, Math.abs(hi) * 0.02, 0.1);
	lo -= pad;
	hi += pad;
	return { min: niceFloor(lo), max: niceCeil(hi) };
}

// 26400.0000004 -> 27000 (2 significant figures up); used for the top of an axis
export function niceCeil(v) {
	if (v <= 0) {
		return v === 0 ? 1 : -niceFloor(-v);
	}
	const step = Math.pow(10, Math.floor(Math.log10(v)) - 1);
	return Math.ceil(v / step - 1e-9) * step;
}

export function niceFloor(v) {
	if (v <= 0) {
		return v === 0 ? 0 : -niceCeil(-v);
	}
	const step = Math.pow(10, Math.floor(Math.log10(v)) - 1);
	return Math.floor(v / step + 1e-9) * step;
}

// Series and reference colors. Slot 1 of the validated categorical palette (blue): passes the lightness band, chroma
// floor and >= 3:1 contrast on DWC's card surfaces (#ffffff light, #1e1e1e dark). A reference line (a configured
// maximum, a measured ceiling) is a neutral dashed grey: it is not an error.
export const SERIES_COLOR = { light: '#2a78d6', dark: '#3987e5' };
export const REFERENCE_COLOR = '#898781';

export function seriesColor(dark) {
	return dark ? SERIES_COLOR.dark : SERIES_COLOR.light;
}

// The step of the time axis, in seconds: the first "nice" step that leaves as many labels as fit in the width of the axis (48 px a label of minutes,
// 64 px one of hours or days, 7 at most); the steps go up to a month, so a phone (390 px) over days never gets labels on top of each other (2026-11-24)
const AXIS_STEPS_S = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14400, 21600, 43200, 86400, 172800, 259200, 604800, 1209600, 2592000]
export function axisStepSeconds(rangeS, axisWidth) {
	const target = Math.min(7, Math.max(2, Math.floor(axisWidth / (rangeS > 3600 ? 64 : 48))))
	for (const s of AXIS_STEPS_S) if (rangeS / s <= target) return s
	return AXIS_STEPS_S[AXIS_STEPS_S.length - 1]
}

// The label of a time tick: with a step of an hour or more only the big unit ("23h", "3d", "1d 3h"), so the labels stay short; under an hour the
// usual compact form of `long` (the tooltip keeps the long form)
export function axisAgoLabel(totalS, stepS, long) {
	if (stepS >= 86400) return `${Math.round(totalS / 86400)}d`
	if (stepS >= 3600 && totalS >= 3600) return totalS >= 86400 ? `${Math.floor(totalS / 86400)}d ${Math.round((totalS % 86400) / 3600)}h` : `${Math.round(totalS / 3600)}h`
	return long(totalS)
}
