'use strict'

// A filled chip needs a text colour that reads on its colour. Vuetify's white text fails on the light fills (2.3:1 on orange, 2.8 on green,
// 3.1 on blue), so the fill and the text are chosen together here, by family of colour, and every filled chip of this plugin asks for them.
// colour name (a Vuetify one: 'green', 'warning', 'orange darken-2', ...) -> { color, textColor } that reads at 4.5:1 or better.
// Pure: test/chip-look.test.js has the contrast of every pair.

const DARK_FILL = [
	[/^(green|success|light-green)\b/, 'green darken-3'],
	[/^(red|error|pink|deep-orange)\b/, 'red darken-2'],
	[/^(blue|info|primary|light-blue|indigo)\b/, 'blue darken-2'],
	[/^(grey|gray|blue-grey|secondary)\b/, 'grey darken-2'],
	[/^(purple|deep-purple)\b/, 'purple darken-2'],
	[/^brown\b/, 'brown darken-1']
]

const LIGHT_FILL = [
	[/^(orange|warning|amber|yellow|lime)\b/, null], // the colour as asked, black text
	[/^(cyan|teal)\b/, null]
]

export function chipLook(name) {
	const n = String(name || '').trim()
	for (const [re, fill] of DARK_FILL) if (re.test(n)) return { color: fill, textColor: 'white' }
	for (const [re] of LIGHT_FILL) if (re.test(n)) return { color: n.replace(/\s+(lighten|darken)-\d$/, ''), textColor: 'black' }
	return { color: n, textColor: 'white' }
}
