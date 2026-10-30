<template>
	<v-chip v-if="holder.held" size="small" variant="outlined" :color="holder.mine ? 'success' : 'warning'" :title="holder.reason">
		<v-icon size="x-small" start>{{ holder.mine ? 'mdi-hand-back-right' : 'mdi-hand-back-right-off' }}</v-icon>{{ text }}
	</v-chip>
</template>

<script setup>
// Who holds the movement of the machine (the single owner of the service), as a chip: "Beto has the control since 14:32" or
// "You have the control". Nothing when nobody holds it. Used by the pages that start sequences (Motors) so a second tab or
// a second person sees WHO is in the way instead of a bare "not started". Logic: control-holder.js.
//
//   <control-holder-chip :model="machineModel()" />     (machineModel from dwc-host.js; without :model it reads DWC's model)

import { computed } from 'vue'
import { controlOf, controlText } from './control-holder.js'
import { machineModel } from './dwc-host.js'

const props = defineProps({
	model: { type: Object, default: null }
})

const holder = computed(() => controlOf(props.model || machineModel()))
const text = computed(() => controlText(holder.value))
</script>
