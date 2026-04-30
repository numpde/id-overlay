# id-overlay

`id-overlay` is a Chromium-targeted browser extension that adds a movable reference-image overlay to the OpenStreetMap iD editor.

It is built for one narrow workflow:
- paste a reference screenshot over the map
- align it roughly
- place screenshot-to-map pin correspondences
- compute a transform
- trace in iD while the overlay follows the map

![Reference Overlay screenshot](docs/reference-overlay-screenshot.jpg)

## Current Scope

- targets Chromium Manifest V3 browsers
  - directly targeted: `Google Chrome`, `Chromium`
  - likely usable in other Chromium-based browsers, but not claimed or tested as a supported target yet
- targets `https://www.openstreetmap.org/edit?editor=id`
- runs as a Manifest V3 content-script extension
- supports two modes:
  - `Align`: register the overlay to the map
  - `Trace`: leave the overlay passive while tracing in iD

The current alignment workflow is:
- paste an image
- move/scale/rotate until it roughly matches
- double-click to add or remove pins
- click `Compute transform`
- switch to `Trace`

## Controls

### Align Mode

| Control | Effect |
| --- | --- |
| Drag | Move the map and overlay together |
| `Shift` + drag | Move only the overlay |
| Wheel | Zoom the map and overlay together |
| `Shift` + wheel | Scale only the overlay around the point under the cursor |
| `Ctrl` + wheel | Rotate only the overlay around the point under the cursor |
| `Alt` + wheel | Adjust only the overlay opacity |
| Double-click on overlay | Add a pin at that screenshot/map correspondence |
| Double-click on an existing pin | Remove that pin |
| `Compute transform` | Solve and apply the transform from the current pins |
| Mode switch to `Trace` | Leave registration mode and keep the overlay passive |

Notes:
- Plain drag and plain wheel stay map-native in `Align`; the overlay follows that shared map motion.
- Dropped pins render in two places from the same stored pin state:
  - a primary pin on the overlay image
  - a subtle inert counterpart on the map

### Trace Mode

| Control | Effect |
| --- | --- |
| Drag on map | Pan the map; overlay follows |
| Wheel on map | Zoom the map; overlay follows |
| `Alt` + wheel over overlay | Adjust only the overlay opacity |
| Mode switch to `Align` | Re-enter registration mode |

Notes:
- In `Trace`, the overlay is passive. The map remains editable in iD.
- In both modes, once a transform has been computed, the overlay prefers that solved transform.

## Install In Chromium

This extension is currently distributed as an **unpacked Chromium extension**.

That means:
- it is **not** installed from the Chrome Web Store
- the GitHub release asset is **not** a one-click installer
- you must **extract the zip** and then point Chromium at the extracted folder with `Load unpacked`

There are two supported install paths:
- download a release zip from GitHub and load the extracted folder
- build locally and load [`dist`](dist)

### Local build

1. Build the extension:

```bash
npm run build:chrome
```

2. Open `chrome://extensions`
3. Enable `Developer mode`
4. Click `Load unpacked`
5. Select [`dist`](dist)

Then open `https://www.openstreetmap.org/edit?editor=id`.

Notes:
- the supported install path today is `Load unpacked` from a folder, not direct zip installation
- release assets are zip packages, not signed store installs or `.crx` files
- Firefox/Safari packaging is not implemented yet

### GitHub release zip

1. Open the releases page:
   - `https://github.com/numpde/id-overlay/releases`
2. Download the latest asset named like:
   - `id-overlay-chrome-0.0.1.zip`
3. Extract that zip somewhere you want to keep it.

Why extract it?
- Chromium’s `Load unpacked` expects a **directory**
- the release zip is just a convenient way to ship that directory through GitHub

4. Open `chrome://extensions`
5. Enable `Developer mode`
6. Click `Load unpacked`
7. Select the **extracted folder**, not the zip file itself
8. Open `https://www.openstreetmap.org/edit?editor=id`

If Chromium says the extension is missing files, you probably selected:
- the zip itself instead of the extracted folder, or
- the parent directory instead of the actual extracted extension directory

## Development

Install dependencies:

```bash
npm install
```

Build:

```bash
npm run build:chrome
```

Run tests:

```bash
npm test
```

Targeted test layers:

```bash
npm run test:unit
npm run test:integration
npm run test:contracts
npm run test:build
```

## GitHub CI and Releases

GitHub Actions now handles two paths:

- `CI`
  - runs on pushes to `main` and on pull requests
  - installs dependencies and runs `npm test`
- `Release`
  - runs on version tags matching `v*`
  - runs `npm test`
  - builds [`dist`](dist)
  - packages a Chromium zip asset
  - creates a GitHub Release and uploads the zip

The current GitHub release artifact is a Chromium extension package:
- `id-overlay-chrome-<version>.zip`

Current release:
- [`v0.0.1`](https://github.com/numpde/id-overlay/releases/tag/v0.0.1)

Versioning is currently single-source in [`manifest.chrome.json`](manifest.chrome.json). The release flow is:

1. Update `manifest.chrome.json` `version`
2. Commit the change
3. Create a matching tag, for example:

```bash
git tag v0.0.2
git push origin main --tags
```

That tag triggers the release workflow and publishes:

- `id-overlay-chrome-<version>.zip`

## Repo Layout

- [`src/content`](src/content): DOM integration, panel, overlay, page adapter
- [`src/core`](src/core): state, transitions, transforms, presentation, storage
- [`scripts`](scripts): build tooling
- [`test`](test): unit, integration, contract, and build tests
- [`notes`](notes): design and refactor notes

## Status

This repo is still intentionally narrow:
- Chromium-targeted first
- GitHub releases publish a Chromium package only
- no cross-browser manifest build yet
- focused on strict state/transition ownership and test coverage before broader feature work
