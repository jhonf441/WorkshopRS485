'use strict'

// A chip of this plugin says its state the way the family does (design/family.css, DESIGN.md "Chips and states"): a NEUTRAL OUTLINE, the word in the text color of
// the page, and a colored DOT for a state. The family draws the dot from the Vuetify semantic color of the chip (success, warning, error, info), so every colour a
// page asks for ('green', 'orange darken-2', 'primary', ...) is translated here to the semantic one it means. No chip is filled any more: a fill needed its own text colour
// (white failed on the light fills: 2.3:1 on orange, 2.8 on green) and, above all, it lost against the family rule and showed dark text on a gray fill.
// Greys, purples and browns carry no state: they stay outlined with no dot.
// colour name (a Vuetify one: 'green', 'warning', 'orange darken-2', ...) -> { color, textColor }. textColor is empty: the text is the one of the page (4.5:1 on both themes,
// test/chip-look.test.js). Pure.

const STATE = [
	[/^(green|success|light-green)\b/, 'success'],
	[/^(red|error|pink|deep-orange)\b/, 'error'],
	[/^(blue|info|primary|light-blue|indigo|cyan|teal)\b/, 'info'],
	[/^(orange|warning|amber|yellow|lime)\b/, 'warning']
]

const NEUTRAL = [
	[/^(grey|gray|blue-grey|secondary)\b/, 'grey'],
	[/^(purple|deep-purple)\b/, 'purple'],
	[/^brown\b/, 'brown']
]

export function chipLook(name) {
	const n = String(name || '').trim()
	for (const [re, color] of STATE) if (re.test(n)) return { color, textColor: '' }
	for (const [re, color] of NEUTRAL) if (re.test(n)) return { color, textColor: '' }
	return { color: n, textColor: 'white' }
}
