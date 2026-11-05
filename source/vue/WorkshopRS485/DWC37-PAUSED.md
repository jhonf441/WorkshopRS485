# DWC 3.7 line: PAUSED

Decision of the owner (Model 2026-11-03, every plugin 2026-11-04): the DWC 3.7 line (`dwc-src/`, Vue 3 / Vuetify 3, and `vue/_shared`) is PAUSED.

- Only DWC 3.6 (`dwc36/dwc-src/`, `vue/_shared36`, `src/` JS plugins) is developed, built, installed, tested on the machine and published.
- Do NOT spend time on the 3.7 line: no new features, no fixes, no styling, no rebuilds, no zips. It was never run on a real DWC 3.7.
- Only what a test forces: pure JS modules and i18n catalogs that the parity tests compare (`tests/lines-*`, `python build.py --lines`) are copied over when it is cheap.
- `build.py` refuses `--dwc 3.7` and leaves the 3.7 zip out of `--dwc both` / `--release` / `--check-release`. Only the owner can ask for `--paused-37`.
- To resume: port the 3.6 components to Vue 3, build with `--paused-37`, test on a real DWC 3.7, restore the 3.7 lines in the public README. See `docs/DWC-LINES.md`.
