<template>
	<v-chip v-if="holder.held" small outlined :color="holder.mine ? 'success' : 'warning'" :title="holder.reason">
		<v-icon x-small left>{{ holder.mine ? 'mdi-hand-back-right' : 'mdi-hand-back-right-off' }}</v-icon>{{ text }}
	</v-chip>
</template>

<script>
'use strict'

// Who holds the movement of the machine (the single owner of the service), as a chip: "Beto has the control since 14:32" or
// "You have the control". Nothing when nobody holds it. Used by the pages that start sequences (Motors) so a second tab or
// a second person sees WHO is in the way instead of a bare "not started". Logic: control-holder.js.
//
//   <control-holder-chip :model="$store.state.machine.model" />

import { controlOf, controlText } from './control-holder.js'

export default {
	props: {
		model: { type: Object, default: null }
	},
	computed: {
		holder() {
			return controlOf(this.model)
		},
		text() {
			return controlText(this.holder)
		}
	}
}
</script>
