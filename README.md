# pixel-crew

Tiny pixel creatures that wander around your page (or your terminal) and show what your jobs are doing.
One creature per job: it walks, talks, naps when it's waiting, jumps on a train when it's ready to ship,
and the train goes red when something breaks.

No dependencies, one file for the browser, one file for the command line.

## Try it

Open `index.html` in a browser, or:

```sh
npx github:Lumingft18/pixel-crew term          # a demo crew in your terminal
npx github:Lumingft18/pixel-crew run -- npm test   # a buddy walks while your command runs
```

## In a web page

```html
<script src="https://cdn.jsdelivr.net/gh/Lumingft18/pixel-crew/src/pixel-crew.js"></script>
<script>
  const crew = PixelCrew.mount(document.body);

  crew.update({
    critters: [
      { id: "api",  color: "#d77757", status: "working", label: "api · refactor", lines: ["moving the auth code"] },
      { id: "docs", color: "#8b5cf6", status: "queued",  label: "docs · approved" },
    ],
    train: { members: ["docs"] },
  });

  crew.say("api", "almost done!");
  crew.event({ kind: "red", text: "tests failed", ids: ["api"] });
</script>
```

It also works as a module (`import "./pixel-crew.js"` then `window.PixelCrew`, or `require` in a bundler).

### State

| field | meaning |
|---|---|
| `critters[]` | `id`, `color`, `status`, `label` (shown on hover), `lines` (what it says; array or function), `hat` (emoji), `size` (`small`, `big`), `sleeping`, `onClick` |
| `train` | `{ members: [ids], say }`: those creatures ride the train; an empty list makes it leave (with `say` as a last word) |
| `env` | `{ paused, offline, hot, temp, night }`: everybody naps, slows down or complains about the heat |
| `events[]` | `{ at, kind: "red" \| "ok" \| "info", text, ids }`: a banner shows up and the creatures involved react |

Statuses with built-in behavior: `working`, `fixing`, `reviewing`, `waiting` (sleeps), `queued` (goes to the
station), `idle`, `boss`. Any other status works too, it just uses the idle lines.

### What they do

- walk, blink, wave, dance, hop, nap;
- say something every now and then (your `lines`, or defaults per status);
- meet each other: chat, high-five, dance together, play tag, wake up whoever is sleeping;
- hover: they tell you what they're doing; drag: you can carry them around; double-click: dance;
  move the mouse fast near them: they run away;
- stay inside the window, also after a resize;
- respect "reduce motion".

## Command line

Requires Node 18+.

```sh
npx github:Lumingft18/pixel-crew serve --state crew.json --open
```

`serve` opens a live page fed by a JSON file (watched for changes) or by `POST /state`, so any script, CI job
or agent can drive it:

```sh
curl -X POST localhost:4321/state -d '{"critters":[{"id":"build","status":"working","color":"#d77757"}]}'
npx github:Lumingft18/pixel-crew push crew.json
```

`term` draws the crew in the terminal with half-block pixels (`--state crew.json` to drive it, `--seconds N`
to stop by itself). `run -- <command>` keeps a little buddy walking on the last line while the command runs,
then celebrates or sulks depending on the exit code.

See `examples/` for a full crew file and a shell script.

## License

MIT
