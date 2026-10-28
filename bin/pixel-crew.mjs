#!/usr/bin/env node
// pixel-crew command line: live page fed by JSON, terminal crew, and a buddy that walks while a command runs.
import { createServer } from "node:http";
import { readFileSync, existsSync, watchFile } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const [, , cmd = "help", ...rest] = process.argv;

function flag(name, fallback) {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : fallback;
}
const has = name => rest.includes(`--${name}`);

const HELP = `pixel-crew: tiny pixel creatures for your jobs

  pixel-crew serve [--port 4321] [--state crew.json] [--open]
      Live page at http://localhost:4321. The crew comes from --state (watched for changes)
      or from POST /state with the same JSON. GET /state returns the current crew.

  pixel-crew push [file.json | -] [--port 4321]
      Send a crew JSON to a running "serve" (from a file or stdin).

  pixel-crew term [--state crew.json] [--seconds 0]
      The crew walking in your terminal (Ctrl-C to quit). Without --state, a demo crew.

  pixel-crew run [--color "#d77757"] -- <command> [args...]
      A buddy walks on the last line while the command runs, then celebrates or sulks.

Crew JSON:
  { "critters": [{ "id": "build", "color": "#d77757", "status": "working", "label": "build #12",
                   "lines": ["compiling…"] }],
    "train": { "members": ["build"] },
    "env": { "paused": false, "offline": false, "hot": false },
    "events": [{ "at": 1730000000, "kind": "red", "text": "tests failed", "ids": ["build"] }] }
Statuses: working, fixing, reviewing, waiting, queued, idle, boss.`;

// ---------- serve / push ----------
function serve() {
  const port = Number(flag("port", 4321));
  const stateFile = flag("state");
  let state = { critters: [] };
  const load = () => { try { state = JSON.parse(readFileSync(stateFile, "utf8")); } catch (e) { console.error(`pixel-crew: ${e.message}`); } };
  if (stateFile) { if (existsSync(stateFile)) load(); watchFile(stateFile, { interval: 700 }, load); }
  const page = readFileSync(join(ROOT, "examples", "live.html"), "utf8");
  const lib = readFileSync(join(ROOT, "src", "pixel-crew.js"), "utf8");
  createServer((req, res) => {
    if (req.method === "POST" && req.url === "/state") {
      let body = "";
      req.on("data", c => { body += c; if (body.length > 1e6) req.destroy(); });
      req.on("end", () => {
        try { state = JSON.parse(body); res.writeHead(204).end(); } catch { res.writeHead(400).end("invalid JSON"); }
      });
      return;
    }
    const send = (type, text) => res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" }).end(text);
    if (req.url === "/state") return send("application/json", JSON.stringify(state));
    if (req.url === "/pixel-crew.js") return send("text/javascript", lib);
    if (req.url === "/" || req.url.startsWith("/?")) return send("text/html; charset=utf-8", page);
    res.writeHead(404).end();
  }).listen(port, "127.0.0.1", () => {
    const url = `http://localhost:${port}/`;
    console.log(`pixel-crew: ${url}${stateFile ? `  (watching ${stateFile})` : "  (POST /state to update)"}`);
    if (has("open")) spawn(process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open", [url],
                           { stdio: "ignore", shell: process.platform === "win32" });
  });
}

async function push() {
  const port = Number(flag("port", 4321));
  const src = rest.find(a => !a.startsWith("--") && a !== String(port)) || "-";
  const body = src === "-" ? readFileSync(0, "utf8") : readFileSync(src, "utf8");
  JSON.parse(body);
  const res = await fetch(`http://127.0.0.1:${port}/state`, { method: "POST", body, headers: { "Content-Type": "application/json" } });
  if (!res.ok) { console.error(`pixel-crew: ${res.status} ${await res.text()}`); process.exit(1); }
}

// ---------- terminal rendering ----------
// Half blocks: every character cell shows two vertical pixels (foreground on top, background below).
const BODY = ["...........", "..XXXXXXX..", "..XoXXXoX..", "XXXXXXXXXXX", "XXXXXXXXXXX", "..XXXXXXX.."];
const ARMS = ["X.........X", "X.XXXXXXX.X", "X.XoXXXoX.X", "XXXXXXXXXXX", "..XXXXXXX..", "..XXXXXXX.."];
const LEGS = [["..X.X.X.X..", "..X...X...."], ["..X.X.X.X..", "....X...X.."], ["..X.X.X.X..", "..X.X.X.X.."]];
const hex = h => { const n = parseInt(h.replace("#", ""), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const fg = ([r, g, b]) => `\x1b[38;2;${r};${g};${b}m`;
const bg = ([r, g, b]) => `\x1b[48;2;${r};${g};${b}m`;
const RESET = "\x1b[0m";
const EYE = [27, 27, 27];

function spritePixels(color, frame, arms, flip) {
  const rows = [...(arms ? ARMS : BODY), ...LEGS[frame]];
  return rows.map(row => [...(flip ? [...row].reverse().join("") : row)].map(c => c === "X" ? color : c === "o" ? EYE : null));
}

function term() {
  const stateFile = flag("state");
  const seconds = Number(flag("seconds", 0));
  const demo = { critters: [
    { id: "api", color: "#d77757", status: "working", label: "api", lines: ["refactoring the API", "tests are green"] },
    { id: "web", color: "#3b82f6", status: "fixing", label: "web", lines: ["fixing a typo…"] },
    { id: "ci", color: "#22c55e", status: "queued", label: "ci", lines: ["waiting for the train 🎫"] },
    { id: "boss", color: "#eab308", status: "boss", label: "boss", lines: ["all good 👑"] },
  ] };
  let state = demo;
  const load = () => { try { state = JSON.parse(readFileSync(stateFile, "utf8")); } catch {} };
  if (stateFile) { load(); watchFile(stateFile, { interval: 700 }, load); }

  const crew = new Map();
  const out = process.stdout;
  out.write("\x1b[?1049h\x1b[?25l");
  const quit = () => { out.write(`${RESET}\x1b[?25h\x1b[?1049l`); process.exit(0); };
  process.on("SIGINT", quit); process.on("SIGTERM", quit);
  if (seconds) setTimeout(quit, seconds * 1000);

  let tick = 0;
  setInterval(() => {
    tick++;
    const W = out.columns || 80, H = Math.max(10, (out.rows || 24) - 1);
    const PH = H * 2;
    const want = new Map((state.critters || []).map(c => [String(c.id), c]));
    for (const id of crew.keys()) if (!want.has(id)) crew.delete(id);
    for (const [id, spec] of want) {
      const c = crew.get(id) || { x: Math.random() * (W - 12), y: 2 + Math.random() * (PH - 14), tx: 0, ty: 0, dir: 1, legs: 0,
                                   wait: 0, talk: 0, text: "", next: tick + 30 + Math.random() * 120 };
      Object.assign(c, { color: hex(spec.color || "#d77757"), spec });
      crew.set(id, c);
    }
    const pixels = Array.from({ length: PH }, () => Array(W).fill(null));
    const labels = [];
    for (const c of crew.values()) {
      const sleeping = c.spec.status === "waiting" || c.spec.sleeping || state.env?.paused;
      if (!sleeping) {
        if (c.wait > 0) c.wait--;
        else {
          const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy);
          if (d < 1) { c.wait = 10 + Math.random() * 40; c.tx = Math.random() * (W - 12); c.ty = 2 + Math.random() * (PH - 14); }
          else { c.x += dx / d * 0.8; c.y += dy / d * 0.4; c.dir = dx < 0 ? -1 : 1; if (tick % 3 === 0) c.legs ^= 1; }
        }
      }
      if (tick > c.next) {
        const lines = c.spec.lines?.length ? c.spec.lines : [c.spec.status || "hi"];
        c.text = sleeping ? "zzz" : lines[Math.floor(Math.random() * lines.length)]; c.talk = 25; c.next = tick + 60 + Math.random() * 150;
      }
      if (c.talk > 0) c.talk--;
      const sprite = spritePixels(c.color, sleeping ? 2 : c.legs, c.wait > 0 && c.wait % 20 < 10 && !sleeping, c.dir < 0);
      const ox = Math.round(c.x), oy = Math.round(c.y) & ~1;
      sprite.forEach((row, y) => row.forEach((p, x) => { if (p && pixels[oy + y]?.[ox + x] !== undefined) pixels[oy + y][ox + x] = p; }));
      labels.push({ row: oy / 2 + 4, col: ox, text: c.spec.label || "" });
      if (c.talk > 0 && c.text) labels.push({ row: oy / 2 - 1, col: ox, text: `‹ ${c.text} ›`, bubble: true });
    }
    let frame = "\x1b[H";
    for (let r = 0; r < H; r++) {
      let line = "";
      const textHere = labels.filter(l => l.row === r);
      for (let x = 0; x < W; x++) {
        const lab = textHere.find(l => x >= l.col && x < l.col + [...l.text].length);
        if (lab) { line += `${RESET}${lab.bubble ? "\x1b[1m" : "\x1b[2m"}${[...lab.text][x - lab.col]}`; continue; }
        const top = pixels[r * 2][x], bot = pixels[r * 2 + 1][x];
        line += top && bot ? `${fg(top)}${bg(bot)}▀` : top ? `${RESET}${fg(top)}▀` : bot ? `${RESET}${fg(bot)}▄` : `${RESET} `;
      }
      frame += line + RESET + (r < H - 1 ? "\n" : "");
    }
    out.write(frame);
  }, 80);
}

// ---------- run ----------
function run() {
  const i = rest.indexOf("--");
  const argv = i >= 0 ? rest.slice(i + 1) : rest;
  if (!argv.length) { console.error("pixel-crew run -- <command> [args...]"); process.exit(2); }
  const color = hex(flag("color", "#d77757"));
  const tty = process.stderr.isTTY;
  const started = Date.now();
  let x = 0, dir = 1, legs = 0, last = "";
  const mini = (frame, mood) => {
    // two-row buddy squeezed into one line: ▟█▙ with legs
    const body = `${fg(color)}${mood === "sad" ? "▙▄▟" : frame ? "▟█▙" : "▙█▟"}${RESET}`;
    return body;
  };
  const status = (mood = "walk") => {
    if (!tty) return;
    const W = process.stderr.columns || 80;
    const secs = ((Date.now() - started) / 1000).toFixed(0);
    const info = mood === "ok" ? " done! 🎉" : mood === "sad" ? " failed 😿" : ` ${secs}s ${last ? "· " + last : ""}`;
    const pad = " ".repeat(Math.max(0, Math.min(x, W - 30)));
    process.stderr.write(`\r\x1b[2K${pad}${mini(legs, mood)}${info.slice(0, Math.max(0, W - pad.length - 5))}`);
  };
  const child = spawn(argv[0], argv.slice(1), { stdio: ["inherit", "pipe", "pipe"], shell: process.platform === "win32" });
  const relay = (stream, target) => {
    let buf = "";
    stream.on("data", chunk => {
      buf += chunk;
      const parts = buf.split("\n"); buf = parts.pop();
      for (const line of parts) { if (tty) process.stderr.write("\r\x1b[2K"); target.write(line + "\n"); last = line.trim().slice(0, 40); }
      status();
    });
    stream.on("end", () => { if (buf) target.write(buf); });
  };
  relay(child.stdout, process.stdout); relay(child.stderr, process.stderr);
  const timer = setInterval(() => {
    const W = process.stderr.columns || 80;
    x += dir; if (x > W - 32 || x < 0) dir *= -1; legs ^= 1; status();
  }, 160);
  child.on("close", code => {
    clearInterval(timer); status(code === 0 ? "ok" : "sad"); if (tty) process.stderr.write("\n");
    process.exit(code ?? 1);
  });
}

({ serve, push, term, run }[cmd] || (() => console.log(HELP)))();
