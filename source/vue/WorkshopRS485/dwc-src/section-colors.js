'use strict'

// The color of each section of the RS485 page (the position in the side bar), one place (the family reads it as --wf-sec on the page root: the 2 px line on
// top of the cards and the line of the open side item). The badge color of the page bar is in vue/_shared/plugin-colors.js.

export const SECTION_COLORS = ['#7E57C2', '#26A69A', '#FB8C00', '#E53935']

export function sectionColor(index) {
	return SECTION_COLORS[index] || SECTION_COLORS[0]
}
