<template>
	<!-- Small editor for a text file of the machine (DWC 3.7 has no file-edit-dialog component to reuse): a dialog with a
	     monospace textarea. It only edits text; the parent writes the file when it receives `save`. -->
	<v-dialog :model-value="modelValue" max-width="720" scrollable @update:model-value="emit('update:modelValue', $event)">
		<v-card>
			<v-card-title class="text-title-medium">{{ filename }}</v-card-title>
			<v-divider />
			<v-card-text class="pt-3">
				<v-textarea v-model="buffer" auto-grow rows="12" max-rows="24" variant="outlined" density="compact" hide-details class="file-edit-text" spellcheck="false" />
			</v-card-text>
			<v-divider />
			<v-card-actions>
				<v-spacer />
				<v-btn variant="text" @click="emit('update:modelValue', false)">{{ ts('edit_dialog_cancel') }}</v-btn>
				<v-btn color="primary" variant="flat" @click="accept">{{ ts('edit_dialog_save') }}</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ts } from './shared-t.js'

const props = defineProps({
	modelValue: { type: Boolean, default: false },
	filename: { type: String, default: '' },
	text: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue', 'update:text', 'save'])

const buffer = ref(props.text)
// every time it opens it starts from the text the parent loaded
watch(() => props.modelValue, open => {
	if (open) buffer.value = props.text
})

function accept() {
	emit('update:text', buffer.value)
	emit('save', buffer.value)
	emit('update:modelValue', false)
}
</script>

<style scoped>
.file-edit-text :deep(textarea) {
	font: 12px/1.35 monospace;
	white-space: pre;
}
</style>
