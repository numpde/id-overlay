# id-overlay

`id-overlay` is a Chromium-first browser extension that adds a movable screenshot overlay to the OpenStreetMap iD editor.

It is meant for one narrow workflow:
- paste a reference screenshot over the map
- align it manually
- place pins to register screenshot pixels to map locations
- compute a transform
- trace in iD with the overlay following the map

![Reference Overlay screenshot](docs/reference-overlay-screenshot.jpg)

## Current Scope

- targets `https://www.openstreetmap.org/edit?editor=id`
- runs as a Manifest V3 content-script extension
- supports two modes:
  - `Align`: move/scale/rotate the overlay and edit pins
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
| `Shift` + wheel | Scale only the overlay |
| `Ctrl` + wheel | Rotate only the overlay |
| `Alt` + wheel | Adjust only the overlay opacity |
| Double-click on overlay | Add a pin at that screenshot/map correspondence |
| Double-click on an existing pin | Remove that pin |
| `Compute transform` | Solve and apply the transform from the current pins |
| Mode switch to `Trace` | Leave registration mode and keep the overlay passive |

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

## Load In Chromium

1. Build the extension:

```bash
npm run build:chrome
```

2. Open `chrome://extensions`
3. Enable `Developer mode`
4. Click `Load unpacked`
5. Select [`dist`](dist)

Then open `https://www.openstreetmap.org/edit?editor=id`.

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
- Chromium first
- no packaged release flow yet
- no cross-browser manifest build yet
- focused on strict state/transition ownership and test coverage before broader feature work
