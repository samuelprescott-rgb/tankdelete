# TankDelete expansion

This workspace starts from [`zacblev1/tankdelete` v0.1.0](https://github.com/zacblev1/tankdelete/releases/tag/v0.1.0) and turns its neon tank-based filesystem explorer into a Vietnam-era-inspired field-operations game.

## Current game loop

- Drive with **W/S** and steer with **A/D**.
- Aim with the mouse and click to fire.
- Press **1**, **2**, or **3** to switch between the cannon, flamethrower attachment, and napalm support.
- The flamethrower sweeps a short cone; napalm affects a larger ground radius and has an eight-second cooldown.
- The first hit marks a file; the second moves it to the operating system Trash.
- Press **X** or **Delete** to trash every marked file.
- Press **Escape** to disarm all marked files.
- Press **Cmd/Ctrl+Z** to restore the last trashed file.
- Drive through folder tunnels to navigate the filesystem.
- Press **M** to play or mute the field radio. Its two polyphonic tracks are original procedural compositions generated with the Web Audio API.
- Choose **Boot Camp** on the start screen to practice against virtual files. Training mode never touches the filesystem.

Start with a disposable test directory until you are comfortable with the controls. TankDelete performs real filesystem operations.

Commercial recordings and song melodies are intentionally not bundled. Licensed audio can be added later through a dedicated media pipeline without changing the gameplay code.

## Development

Prerequisites: Node.js, npm, the Rust toolchain, and the platform requirements for [Tauri 2](https://v2.tauri.app/start/prerequisites/).

```sh
npm install
npm run tauri dev
```

Build the web frontend with:

```sh
npm run build
```

Build the desktop application with:

```sh
npm run tauri build
```

## Expansion directions

The cleanest next milestones are:

1. Missions and score multipliers based on cleanup goals.
2. A protected-file rules engine for live directories.
3. Better large-directory scanning with cancellation and cached sizes.
4. Gamepad support, settings, and accessibility controls.
5. A licensed-audio import pipeline with volume and playlist controls.

The repository did not include a license at the `v0.1.0` tag. Confirm permission with the original author before redistributing a derivative build.
