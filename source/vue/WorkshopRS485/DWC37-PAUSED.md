# DWC 3.7 line: paused

The DWC 3.7 line of this plugin (`dwc-src/`, Vue 3, and `vue/_shared`) is paused: only 3.6 is built and released.

- Only DWC 3.6 (`dwc36/dwc-src/`, `vue/_shared36`, `src/` JS plugins) is developed, built, installed and published. The release has only the `-dwc3.6.zip`.
- The 3.7 line was never run on a real DWC 3.7 (it was only tested without a browser). It stays in the repository as it is and may lag behind the 3.6 line.
- Pure JS modules and i18n catalogs that the parity tests compare (`tests/lines-*`, `python build.py --lines`) are still copied over when it is cheap.
- `build.py` refuses `--dwc 3.7` and leaves the 3.7 zip out of `--dwc both` / `--release` / `--check-release`, unless `--paused-37` is given explicitly.
- Public documents say "DWC 3.6.x only".
- To resume: port the 3.6 components to Vue 3, build with `--paused-37`, test on a real DWC 3.7, restore the 3.7 lines in the public README. See `docs/DWC-LINES.md`.
