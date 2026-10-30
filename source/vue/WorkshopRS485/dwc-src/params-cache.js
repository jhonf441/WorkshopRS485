'use strict'

// Values read from each T3D servo, kept per device while the plugin is loaded: they survive closing and opening the
// parameters panel (the whole servo is not read again every time). Module state, not component state:
// <script setup> runs once per instance.
export const PARAMS_CACHE = {}
