// Pixel Crew for VS Code, Cursor and other compatible editors.
// The crew lives in a sidebar webview; the extension feeds it with what is running in the editor.
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

const COLORS = ["#d77757", "#3b82f6", "#22c55e", "#8b5cf6", "#f59e0b", "#ec4899", "#12a5c9", "#e8e8e8"];
const BOSS_COLOR = "#eab308";

let view = null;
let statusItem = null;
let walkTimer = null;
const jobs = new Map(); // id -> critter
let external = { critters: [] };
let lastEvent = null;
let colorIndex = 0;

const cfg = key => vscode.workspace.getConfiguration("pixelCrew").get(key);
const nextColor = () => COLORS[colorIndex++ % COLORS.length];
const short = (text, n = 32) => (text.length > n ? text.slice(0, n - 1) + "…" : text);

// ---------- what goes to the crew ----------
function bossCritter() {
  if (!cfg("boss")) return null;
  const lines = [];
  const git = gitInfo();
  if (git) lines.push(git);
  const problems = problemCount();
  lines.push(problems.errors ? `${problems.errors} error${problems.errors > 1 ? "s" : ""} in Problems` : "no errors 👌");
  if (problems.warnings) lines.push(`${problems.warnings} warnings`);
  const running = jobs.size;
  lines.push(running ? `${running} thing${running > 1 ? "s" : ""} running` : "all quiet");
  return { id: "boss", color: BOSS_COLOR, status: "boss", size: "big", label: "boss", lines };
}

function crewState() {
  const critters = [];
  const boss = bossCritter();
  if (boss) critters.push(boss);
  critters.push(...jobs.values());
  for (const c of external.critters || []) critters.push({ ...c, id: `ext:${c.id}` });
  const state = { critters, env: external.env || {} };
  if (external.train) state.train = { ...external.train, members: (external.train.members || []).map(id => `ext:${id}`) };
  if (lastEvent) state.events = [lastEvent];
  return state;
}

function push() {
  if (view) view.webview.postMessage({ type: "state", state: crewState() });
  updateStatusBar();
}

function event(kind, text, ids = []) {
  lastEvent = { at: Date.now() / 1000, kind, text, ids };
  push();
}

// ---------- sources: tasks, debug, terminal ----------
function addJob(id, label, status, lines) {
  const prev = jobs.get(id) || {};
  jobs.set(id, { id, color: prev.color || nextColor(), status, label: short(label, 40), lines, started: prev.started || Date.now() });
  push();
}

function endJob(id, ok, text) {
  const job = jobs.get(id);
  jobs.delete(id);
  if (job) event(ok ? "ok" : "red", text);
  else push();
}

function watchTasks(context) {
  context.subscriptions.push(
    vscode.tasks.onDidStartTaskProcess(e => {
      if (!cfg("watchTasks")) return;
      const name = e.execution.task.name;
      addJob(`task:${name}:${e.processId}`, name, "working", [`running ${short(name)}`, "working on it…"]);
    }),
    vscode.tasks.onDidEndTaskProcess(e => {
      const name = e.execution.task.name;
      const id = [...jobs.keys()].find(k => k.startsWith(`task:${name}:`));
      if (id) endJob(id, e.exitCode === 0, e.exitCode === 0 ? `✓ ${name} finished` : `✗ ${name} failed (exit ${e.exitCode})`);
    }),
  );
}

function watchDebug(context) {
  context.subscriptions.push(
    vscode.debug.onDidStartDebugSession(s => {
      if (cfg("watchDebug")) addJob(`debug:${s.id}`, `debug · ${s.name}`, "fixing", ["hunting bugs 🔎", `debugging ${short(s.name)}`]);
    }),
    vscode.debug.onDidTerminateDebugSession(s => {
      if (jobs.has(`debug:${s.id}`)) { jobs.delete(`debug:${s.id}`); push(); }
    }),
  );
}

function watchTerminal(context) {
  // Shell integration events exist from VS Code 1.93; older editors simply skip this source.
  if (!vscode.window.onDidStartTerminalShellExecution) return;
  const ids = new WeakMap();
  let n = 0;
  context.subscriptions.push(
    vscode.window.onDidStartTerminalShellExecution(e => {
      if (!cfg("watchTerminal")) return;
      const line = (e.execution.commandLine && e.execution.commandLine.value) || "command";
      if (!line.trim()) return;
      const id = `term:${++n}`;
      ids.set(e.execution, id);
      addJob(id, `$ ${line}`, "working", [`running: ${short(line, 28)}`, "terminal at work"]);
    }),
    vscode.window.onDidEndTerminalShellExecution(e => {
      const id = ids.get(e.execution);
      if (!id) return;
      const line = (e.execution.commandLine && e.execution.commandLine.value) || "command";
      const ok = e.exitCode === undefined || e.exitCode === 0;
      // Short commands come and go without a banner: only failures and long ones are worth one.
      const job = jobs.get(id);
      if (!ok || (job && Date.now() - job.started > 15000)) endJob(id, ok, ok ? `✓ ${short(line, 50)}` : `✗ ${short(line, 50)} (exit ${e.exitCode})`);
      else { jobs.delete(id); push(); }
    }),
  );
}

// ---------- boss info ----------
function gitInfo() {
  try {
    const git = vscode.extensions.getExtension("vscode.git");
    if (!git || !git.isActive) return null;
    const repo = git.exports.getAPI(1).repositories[0];
    if (!repo) return null;
    const head = repo.state.HEAD;
    const changes = repo.state.workingTreeChanges.length + repo.state.indexChanges.length;
    const branch = head && head.name ? head.name : "detached";
    const ahead = head && head.ahead ? `, ${head.ahead} to push` : "";
    return changes ? `${changes} change${changes > 1 ? "s" : ""} on ${branch}${ahead}` : `${branch} is clean${ahead}`;
  } catch { return null; }
}

function problemCount() {
  let errors = 0, warnings = 0;
  for (const [, list] of vscode.languages.getDiagnostics()) for (const d of list) {
    if (d.severity === vscode.DiagnosticSeverity.Error) errors++;
    else if (d.severity === vscode.DiagnosticSeverity.Warning) warnings++;
  }
  return { errors, warnings };
}

// ---------- external crew: JSON file or URL ----------
function watchExternal(context) {
  let fileWatcher = null, timer = null;
  const reload = () => {
    fileWatcher && fileWatcher.dispose(); fileWatcher = null;
    clearInterval(timer); timer = null;
    external = { critters: [] };
    const file = cfg("stateFile");
    if (file) {
      const folder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
      const full = path.isAbsolute(file) || !folder ? file : path.join(folder.uri.fsPath, file);
      const read = () => { try { external = JSON.parse(fs.readFileSync(full, "utf8")); push(); } catch {} };
      read();
      fileWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(path.dirname(full), path.basename(full)));
      fileWatcher.onDidChange(read); fileWatcher.onDidCreate(read);
    }
    const url = cfg("stateUrl");
    if (url && typeof fetch === "function") {
      const poll = async () => { try { const r = await fetch(url); if (r.ok) { external = await r.json(); push(); } } catch {} };
      poll(); timer = setInterval(poll, 3000);
    }
    push();
  };
  reload();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration("pixelCrew")) { reload(); updateStatusBar(); } }),
    { dispose: () => { fileWatcher && fileWatcher.dispose(); clearInterval(timer); } },
  );
}

// ---------- status bar buddy ----------
function updateStatusBar() {
  if (!statusItem) return;
  if (!cfg("statusBar")) { statusItem.hide(); clearInterval(walkTimer); walkTimer = null; return; }
  const running = jobs.size;
  statusItem.tooltip = running ? [...jobs.values()].map(j => j.label).join("\n") : "Pixel Crew: all quiet";
  statusItem.show();
  if (running && !walkTimer) {
    let frame = 0;
    walkTimer = setInterval(() => {
      frame = (frame + 1) % 6;
      const pad = " ".repeat(frame < 3 ? frame : 5 - frame);
      statusItem.text = `${pad}${frame % 2 ? "▟█▙" : "▙█▟"} ${jobs.size}`;
    }, 280);
  } else if (!running) {
    clearInterval(walkTimer); walkTimer = null;
    statusItem.text = "▟█▙";
  }
}

// ---------- webview ----------
class CrewView {
  constructor(context) { this.context = context; }
  resolveWebviewView(webviewView) {
    view = webviewView;
    const media = vscode.Uri.joinPath(this.context.extensionUri, "media");
    webviewView.webview.options = { enableScripts: true, localResourceRoots: [media] };
    const lib = webviewView.webview.asWebviewUri(vscode.Uri.joinPath(media, "pixel-crew.js"));
    const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const csp = `default-src 'none'; style-src ${webviewView.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';`;
    webviewView.webview.html = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  html, body { height: 100%; margin: 0; overflow: hidden; background: transparent; }
  .pc-layer, .pc-banner { --pc-bg: var(--vscode-editorHoverWidget-background, #fff); --pc-fg: var(--vscode-editorHoverWidget-foreground, #111); }
  .pc-banner { font-size: 12px; }
  .hint { position: fixed; left: 8px; bottom: 6px; font: 11px var(--vscode-font-family); color: var(--vscode-descriptionForeground); }
</style></head><body>
<div class="hint">drag · double-click to dance</div>
<script nonce="${nonce}" src="${lib}"></script>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const crew = PixelCrew.mount(document.body, { top: 0, bottom: 70, talkEvery: [9000, 26000],
    onClick: id => vscode.postMessage({ type: "click", id }) });
  addEventListener("message", e => {
    const m = e.data;
    if (m.type === "state") crew.update(m.state);
    if (m.type === "say") crew.say(m.id, m.text, 4000);
    if (m.type === "event") crew.event(m.event);
  });
  vscode.postMessage({ type: "ready" });
</script></body></html>`;
    webviewView.webview.onDidReceiveMessage(m => {
      if (m.type === "ready") push();
      if (m.type === "click" && String(m.id).startsWith("task:")) vscode.commands.executeCommand("workbench.action.tasks.showTasks");
      if (m.type === "click" && String(m.id).startsWith("debug:")) vscode.commands.executeCommand("workbench.view.debug");
      if (m.type === "click" && String(m.id).startsWith("term:")) vscode.commands.executeCommand("workbench.action.terminal.focus");
      if (m.type === "click" && m.id === "boss") vscode.commands.executeCommand("workbench.actions.view.problems");
    });
    webviewView.onDidDispose(() => { view = null; });
  }
}

function activate(context) {
  context.subscriptions.push(vscode.window.registerWebviewViewProvider("pixelCrew.crew", new CrewView(context),
    { webviewOptions: { retainContextWhenHidden: true } }));

  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusItem.command = "pixelCrew.show";
  statusItem.text = "▟█▙";
  context.subscriptions.push(statusItem, { dispose: () => clearInterval(walkTimer) });

  context.subscriptions.push(
    vscode.commands.registerCommand("pixelCrew.show", () => vscode.commands.executeCommand("pixelCrew.crew.focus")),
    vscode.commands.registerCommand("pixelCrew.celebrate", () => event("ok", "🎉 nice work!", [...jobs.keys(), "boss"])),
    vscode.commands.registerCommand("pixelCrew.toggleStatusBar", () =>
      vscode.workspace.getConfiguration("pixelCrew").update("statusBar", !cfg("statusBar"), vscode.ConfigurationTarget.Global)),
    vscode.commands.registerCommand("pixelCrew.say", async () => {
      const text = await vscode.window.showInputBox({ prompt: "What should the boss say?" });
      if (text && view) view.webview.postMessage({ type: "say", id: "boss", text });
    }),
    vscode.languages.onDidChangeDiagnostics(() => push()),
  );

  watchTasks(context);
  watchDebug(context);
  watchTerminal(context);
  watchExternal(context);

  // git starts after us: refresh the boss once it is ready and on every change
  const git = vscode.extensions.getExtension("vscode.git");
  if (git) Promise.resolve(git.isActive ? git.exports : git.activate()).then(api => {
    try {
      const g = api.getAPI(1);
      const hook = repo => context.subscriptions.push(repo.state.onDidChange(() => push()));
      g.repositories.forEach(hook);
      context.subscriptions.push(g.onDidOpenRepository(repo => { hook(repo); push(); }));
      push();
    } catch {}
  }, () => {});

  updateStatusBar();
}

function deactivate() { clearInterval(walkTimer); }

module.exports = { activate, deactivate };
