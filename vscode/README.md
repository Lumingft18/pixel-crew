# Pixel Crew for VS Code and Cursor

Tiny pixel creatures in your sidebar that show what the editor is doing.

- one creature per running **task**, **debug session** and **terminal command** (terminals need shell
  integration, on by default in recent VS Code and Cursor);
- a **boss** that tells you the git branch, how many changes, and how many errors are in Problems;
- when something finishes you get a banner: green when it worked, red (and a red train) when it failed;
- a little **buddy in the status bar** walks while something is running; click it to open the crew;
- hover a creature to hear what it's doing, drag it around, double-click to make it dance,
  click it to jump to the task, the debugger, the terminal or the Problems panel.

Works in VS Code 1.75+, Cursor, VSCodium and Windsurf. No dependencies.

## Bring your own crew

Point `pixelCrew.stateFile` to a JSON file, or `pixelCrew.stateUrl` to `http://localhost:4321/state` from
`npx github:Lumingft18/pixel-crew serve`, and those creatures join the crew too (same format as the web
library: `critters`, `train`, `env`, `events`).

## Install

Download `pixel-crew-*.vsix` from the GitHub releases, then:

```sh
code --install-extension pixel-crew-0.1.0.vsix     # VS Code
cursor --install-extension pixel-crew-0.1.0.vsix   # Cursor
```

or *Extensions → … → Install from VSIX…*.

Build it yourself: `cd vscode && npm run package`.

## Settings

| setting | default | |
|---|---|---|
| `pixelCrew.statusBar` | `true` | walking buddy in the status bar |
| `pixelCrew.watchTasks` / `watchDebug` / `watchTerminal` | `true` | which things get a creature |
| `pixelCrew.boss` | `true` | git and Problems reporter |
| `pixelCrew.stateFile` | | extra creatures from a JSON file |
| `pixelCrew.stateUrl` | | extra creatures from a URL |
