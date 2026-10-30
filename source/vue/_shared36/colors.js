import { pluginOf } from './workshop-ids.js'

// Screen colors for the Vue pages (2026-10-10, DESIGN.md section 2).
// Same rule as src/_shared/02-colors.js: a Lights LED color (pure,
// loud) is shown with the same hue but fixed saturation and lightness.
//   'relleno' background with white text, 'texto' on a dark background, 'claro' on a light background.

function hexHsl(hex) {
	const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || '').trim());
	if (!m) return null;
	const r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255;
	const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
	let h = 0, s = 0;
	if (mx !== mn) {
		const d = mx - mn;
		s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
		h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
		h /= 6;
	}
	return { h, s, l };
}

function hslHex(h, s, l) {
	const f = (n) => {
		const k = (n + h * 12) % 12;
		const a = s * Math.min(l, 1 - l);
		const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
		return ('0' + Math.round(c * 255).toString(16)).slice(-2);
	};
	return '#' + f(0) + f(8) + f(4);
}

const uses = { fill: [0.62, 0.42], text: [0.7, 0.72], bright: [0.65, 0.34] };

export function colorScreen(hex, use = 'fill') {
	const c = hexHsl(hex);
	if (!c) return hex;
	const t = uses[use] || uses.fill;
	if (c.s < 0.08) return hex;
	return hslHex(c.h, Math.min(c.s, t[0]), t[1]);
}

// Color of a mode (Laser / CNC / FFF) from Lights, in screen version.
// 'store' is this.$store; without Lights data, gray.
export function colorMode(store, mode, use = 'text') {
	const pc = store && store.state && store.state.machine && store.state.machine.model && store.state.machine.model.plugins;
	const d = pluginOf(pc, 'service');
	const hex = d && d.data && d.data.statusLightModeColors && d.data.statusLightModeColors[mode];
	return hex ? colorScreen(hex, use) : '#9e9e9e';
}
