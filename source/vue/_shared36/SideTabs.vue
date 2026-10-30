<template>
	<nav class="sidetabs" :class="{ 'st-collapsed': collapsed }" role="tablist" aria-orientation="vertical" :aria-label="ts('sidebar_label')" @keydown="move">
		<div class="st-head">
			<button v-if="!collapsed" type="button" class="st-fold st-pin" :class="{ 'st-pinned': pinned }" :aria-pressed="pinned ? 'true' : 'false'" :title="ts(pinned ? 'sidebar_unpin' : 'sidebar_pin')" @click.stop="togglePin">
				<v-icon small>{{ pinned ? 'mdi-pin' : 'mdi-pin-outline' }}</v-icon><span class="st-pin-label">{{ ts('sidebar_pin_label') }}</span>
			</button>
			<button type="button" class="st-fold" :aria-label="ts(collapsed ? 'sidebar_open' : 'sidebar_fold')" :aria-expanded="collapsed ? 'false' : 'true'" :title="ts(collapsed ? 'sidebar_open' : 'sidebar_fold')" @click.stop="collapsed = !collapsed">
				<v-icon small>{{ collapsed ? 'mdi-chevron-double-right' : 'mdi-chevron-double-left' }}</v-icon>
			</button>
		</div>
		<template v-for="(it, i) in items">
			<div v-if="it.group && (i === 0 || items[i - 1].group !== it.group)" :key="'g' + i" class="st-group" :data-group="indexGroup(it.group)">{{ it.group }}</div>
			<button
				:key="'i' + i"
				type="button"
				role="tab"
				class="st-item"
				:class="{ 'st-on': value === key(it, i), 'st-off': it.disabled }"
				:data-group="it.group ? indexGroup(it.group) : null"
				:aria-selected="value === key(it, i) ? 'true' : 'false'"
				:tabindex="i === tabbable ? 0 : -1"
				:disabled="it.disabled"
				:title="it.hint ? it.label + ': ' + it.hint : it.label" :aria-label="it.hint ? it.label + ': ' + it.hint : it.label"
				@click="choose(it, i)"
			>
				<v-icon :size="18" class="st-icon">{{ it.icon }}</v-icon>
				<span class="st-label">{{ it.label }}</span>
				<span v-if="it.badge" class="st-badge">{{ it.badge }}</span>
			</button>
		</template>
	</nav>
</template>

<script>
/* Vertical tab bar, the same as the bars of Vision (.tv-nav) and the Work table (.tz-nav) and as the one
 * of the Cameras page (.ctl-nav): 190 px, sticky under the DWC top bar, 52 px with only the icons when
 * folded. The double arrow at the top folds / opens it; choosing an item folds it by itself (it opens
 * again only with the arrow: nothing opens or floats over the page by hovering), unless the bar is
 * pinned: the pin next to the arrow (always visible, with its name while open) keeps it open when an item is chosen.
 * The choice is remembered per page in this browser (localStorage, the route is the key).
 * items: [{ id?, label, icon, disabled?, group?, badge?, hint? }] (hint: why an item is disabled, shown as its tooltip); value: the id of the chosen item (or its index
 * when the items have no id). The page keeps its v-tabs-items / v-if content: wrap bar + content in
 * .st-layout / .st-body. */
import { ts } from './shared-t.js';

const PIN_KEY = 'workshopSideTabsPinned:';

function pinStore(write) {
	try {
		const key = PIN_KEY + (location.hash || location.pathname);
		if (write === undefined) return localStorage.getItem(key) === '1';
		if (write) localStorage.setItem(key, '1'); else localStorage.removeItem(key);
	} catch (e) { /* no storage (private window): the pin just is not remembered */ }
	return !!write;
}

export default {
	name: 'SideTabs',
	props: {
		items: { type: Array, required: true },
		value: { default: 0 },
	},
	data() {
		return { collapsed: false, pinned: pinStore() };
	},
	computed: {
		// roving tabindex: only the chosen tab (else the first enabled one) is in the Tab order; the arrow keys move between the tabs
		tabbable() {
			const chosen = this.items.findIndex((it, i) => this.key(it, i) === this.value && !it.disabled);
			return chosen >= 0 ? chosen : this.items.findIndex(it => !it.disabled);
		},
	},
	methods: {
		ts,
		move(ev) {
			const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1, Home: 'first', End: 'last' };
			if (!(ev.key in keys)) return;
			const tabs = Array.from(ev.currentTarget.querySelectorAll('[role="tab"]:not([disabled])'));
			if (!tabs.length) return;
			const at = tabs.indexOf(document.activeElement);
			const step = keys[ev.key];
			const next = step === 'first' ? 0 : step === 'last' ? tabs.length - 1 : (at + step + tabs.length) % tabs.length;
			ev.preventDefault();
			tabs[next].focus();
		},
		togglePin() {
			this.pinned = !this.pinned;
			pinStore(this.pinned);
		},
		key(it, i) {
			return it.id !== undefined ? it.id : i;
		},
		indexGroup(g) {
			const names = [];
			this.items.forEach(x => { if (x.group && names.indexOf(x.group) < 0) names.push(x.group); });
			return Math.min(names.indexOf(g), 2);
		},
		// Each section has its own height: choosing a shorter one made the page shorter, the browser cut the scroll back and the
		// page jumped. The layout keeps the tallest height it has had (it only grows), so the scroll stays where it was.
		holdHeight() {
			const layout = this.$el && this.$el.closest && this.$el.closest('.st-layout');
			if (!layout) return;
			const h = layout.offsetHeight;
			if (h > (parseFloat(layout.style.minHeight) || 0)) layout.style.minHeight = h + 'px';
		},
		// choosing an item from far down the page takes the view to the start of the section that opens (under the DWC top bar)
		showTop() {
			const layout = this.$el && typeof this.$el.closest === 'function' ? this.$el.closest('.st-layout') : null;
			if (layout && layout.getBoundingClientRect().top < 0 && typeof layout.scrollIntoView === 'function') {
				layout.style.scrollMarginTop = '72px';
				layout.scrollIntoView({ block: 'start' });
			}
		},
		choose(it, i) {
			this.holdHeight();
			this.$emit('input', this.key(it, i));
			this.showTop();
			if (!this.pinned) this.collapsed = true;
		},
	},
};
</script>

<style>
/* STRUCTURE only (layout, widths, folding, wrapping). The look (colors, text, lines, hover, active mark) is design/family.css. */
.st-layout { display: flex; gap: 14px; align-items: flex-start; }
.st-body { flex: 1 1 auto; min-width: 0; }
.sidetabs { position: sticky; top: 64px; flex: none; width: 190px; display: flex; flex-direction: column; padding: 0 4px 8px 0; }
.sidetabs.st-collapsed { width: 52px; }
.sidetabs .st-head { display: flex; align-items: center; justify-content: space-between; }
.sidetabs.st-collapsed .st-head { flex-direction: column-reverse; justify-content: center; }
.sidetabs .st-pin { width: auto; min-width: 32px; padding: 0 8px; display: inline-flex; align-items: center; gap: 4px; }
.sidetabs .st-pin-label { white-space: nowrap; }
.sidetabs.st-collapsed .st-pin { width: 32px; padding: 0; justify-content: center; }
.sidetabs .st-fold { align-self: flex-end; height: 32px; width: 32px; border: none; background: transparent; color: inherit; cursor: pointer; }
.sidetabs.st-collapsed .st-fold { align-self: center; }
.sidetabs .st-group { padding: 12px 12px 4px; }
.sidetabs .st-item { display: flex; align-items: center; gap: 10px; min-height: 40px; width: 100%; padding: 6px 12px; border: none; border-left: 2px solid transparent; font: inherit; text-align: left; cursor: pointer; }
.sidetabs .st-item.st-off { cursor: not-allowed; }
.sidetabs .st-icon { flex: none; }
.sidetabs .st-label { flex: 1 1 auto; min-width: 0; line-height: 1.25; }
.sidetabs .st-badge { flex: none; padding: 0 6px; }
/* folded: only the icons */
.sidetabs.st-collapsed .st-label, .sidetabs.st-collapsed .st-badge { display: none; }
.sidetabs.st-collapsed .st-item { justify-content: center; padding: 6px 0; }
/* the name of the group stays readable when folded (short, small): "Operate" / "Configure" */
.sidetabs.st-collapsed .st-group { font-size: 9px; line-height: 1.1; padding: 8px 2px 2px; margin: 4px 0 0 0; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@media (max-width: 900px) {
	.st-layout { flex-direction: column; gap: 8px; align-items: stretch; }
	.st-body { width: 100%; }
	.sidetabs, .sidetabs.st-collapsed { position: static; width: 100%; flex-direction: row; flex-wrap: wrap; border-right: none; border-bottom-width: 1px; border-bottom-style: solid; padding: 0 0 4px; }
	.sidetabs .st-fold { display: none; }
	/* in the row layout the group name goes before its tabs, so "Configure" is still there */
	.sidetabs.sidetabs .st-group, .sidetabs.st-collapsed .st-group { display: inline-flex; align-items: center; flex: none; padding: 0 8px 0 6px; margin: 0; border-top: 0; font-size: 11px; text-align: left; overflow: visible; }
	.sidetabs .st-item, .sidetabs.st-collapsed .st-item { width: auto; flex: none; border-left: none; border-bottom: 2px solid transparent; justify-content: flex-start; padding: 6px 12px; }
	.sidetabs.st-collapsed .st-label { display: block; }
}
</style>
