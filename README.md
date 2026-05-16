# id-overlay

`id-overlay` is a Chromium extension for the OpenStreetMap iD editor. It lets
you place a reference image over the map, line it up, and then trace from it
while editing in iD.

The project is intentionally narrow: it targets the iD editor on
`openstreetmap.org`, builds as an unpacked Chromium extension, and focuses on
making the overlay behavior predictable.

![Reference Overlay screenshot](docs/reference-overlay-screenshot.jpg)

## What It Does

The normal workflow is:

1. Open the OpenStreetMap iD editor.
2. Paste a reference image.
3. Use `Align` mode to move, scale, rotate, and pin the image to the map.
4. Switch to `Trace` mode.
5. Trace in iD while the image follows the map.

There are two modes:

- `Align` is for positioning the reference image.
- `Trace` is for editing the map. The overlay becomes passive, and iD receives
  the normal map interactions.

## Controls

### Align Mode

Use `Align` when the image needs to be positioned.

| Control | Result |
| --- | --- |
| Drag | Pan the map; the overlay follows the map |
| `Shift` + drag | Move only the overlay |
| Wheel | Zoom the map; the overlay follows the map |
| `Shift` + wheel | Scale only the overlay around the cursor |
| `Ctrl` + wheel | Rotate only the overlay around the cursor |
| `Alt` + wheel | Change only the overlay opacity |
| Double-click the overlay | Add a pin at that image/map point |
| Double-click an existing pin | Remove that pin |
| Switch to `Trace` | Fit the overlay from the current pins, when possible |

Pins are correspondence points: one point on the image, one matching point on
the map. After there are enough useful pins, switching to `Trace` computes a
placement that stays tied to the map as you pan and zoom.

### Trace Mode

Use `Trace` when you want to edit in iD.

| Control | Result |
| --- | --- |
| Drag the map | Pan the map; the overlay follows |
| Wheel the map | Zoom the map; the overlay follows |
| `Alt` + wheel over the overlay | Change overlay opacity |
| Switch to `Align` | Return to overlay positioning |

In `Trace`, the overlay should not block normal iD editing. The image stays
registered to the map as the map moves.

## Install in Chromium

This extension is distributed as an unpacked Chromium extension.

That means:

- it is not installed from the Chrome Web Store
- the release zip is not a one-click installer
- you must extract the zip, then load the extracted folder in Chromium

Supported browsers today:

- Google Chrome
- Chromium

Other Chromium-based browsers may work, but they are not the supported target
yet.

### Install from a Release Zip

1. Open the releases page:
   `https://github.com/numpde/id-overlay/releases`
2. Download the latest `id-overlay-chrome-<version>.zip` asset.
3. Extract the zip somewhere you want to keep the extension.
4. Open `chrome://extensions`.
5. Enable `Developer mode`.
6. Click `Load unpacked`.
7. Select the extracted extension folder, not the zip file.
8. Open `https://www.openstreetmap.org/edit?editor=id`.

If Chromium says files are missing, you probably selected the zip itself, the
wrong parent folder, or a folder that was moved after loading.

### Build and Install Locally

Install dependencies:

```bash
npm install
```

Build the extension:

```bash
npm run build:chrome
```

Then load the local [`dist`](dist) folder:

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select [`dist`](dist).
5. Open `https://www.openstreetmap.org/edit?editor=id`.

## Development

Run the main test suite:

```bash
npm test
```

Build the Chromium package:

```bash
npm run build:chrome
```

Useful focused checks:

```bash
npm run test:hex:class-a
npm run test:hex:class-b
npm run test:hex:class-c
npm run test:hex:candidates
npm run test:flow
```

Tests are grouped by how much design weight they carry:

- `class-a`: settled behavior and architecture rules
- `class-b`: strong behavior examples that still leave some design room
- `class-c`: suspicious or speculative tests kept away from stronger claims
- `unclassified`: proposals that still need to be judged

Some tests are flow witnesses: they exercise a user or system flow and can emit
trace files. Those traces help review whether the flow has clear starting
points, steps, and outcomes.

## Repository Layout

- [`hex/domain`](hex/domain): pure domain rules such as placement,
  registration, opacity, and image policy
- [`hex/application`](hex/application): application state, commands, effects,
  history, validation, and view models
- [`hex/ports`](hex/ports): browser-neutral port definitions
- [`hex/adapters`](hex/adapters): browser, OpenStreetMap/iD, storage, timer,
  input, overlay, and panel adapters
- [`hex/bootstrap`](hex/bootstrap): extension composition and runtime wiring
- [`hex/test`](hex/test): grouped tests and flow witnesses
- [`src/content/content-loader.js`](src/content/content-loader.js): the small
  content-script loader used by the packaged extension
- [`scripts`](scripts): build and manifest tooling
- [`notes`](notes): design notes and retained legacy evidence
- [`docs`](docs): screenshots and project documentation assets

The old legacy app has been removed from the working tree. The retained lessons
from it are summarized in
[`notes/006_legacy_retention_insights.txt`](notes/006_legacy_retention_insights.txt).

## CI and Releases

GitHub Actions runs CI on pushes to `main` and on pull requests. CI installs
dependencies and runs:

```bash
npm test
```

The release workflow runs for tags named `v*`. It tests, builds [`dist`](dist),
creates a zip named `id-overlay-chrome-<version>.zip`, and publishes it as a
GitHub Release asset.

The extension version lives in [`manifest.chrome.json`](manifest.chrome.json).
To publish a new release:

1. Update the `version` in [`manifest.chrome.json`](manifest.chrome.json).
2. Commit the change.
3. Create and push a matching tag:

```bash
git tag v0.0.2
git push origin main --tags
```

Current release tag:

- [`v0.0.1`](https://github.com/numpde/id-overlay/releases/tag/v0.0.1)

## Status

This is still a focused tool, not a general browser extension platform.

Current limits:

- Chromium only
- OpenStreetMap iD only
- unpacked-extension install path
- no Firefox or Safari package yet
- no Chrome Web Store distribution yet
