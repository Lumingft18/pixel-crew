/*!
 * pixel-crew: tiny pixel creatures that wander around a page and show what your jobs are doing.
 * No dependencies. Works as a plain <script> (window.PixelCrew) or as an ES module import.
 * MIT License
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PixelCrew = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // ---------- sprites ----------
  // 11x8 pixel grid. X body, o eye, row 0 is free for raised arms.
  const FRAMES = {
    body: ["...........", "..XXXXXXX..", "..XoXXXoX..", "XXXXXXXXXXX", "XXXXXXXXXXX", "..XXXXXXX.."],
    arms: ["X.........X", "X.XXXXXXX.X", "X.XoXXXoX.X", "XXXXXXXXXXX", "..XXXXXXX..", "..XXXXXXX.."],
    legs: [["..X.X.X.X..", "..X...X...."], ["..X.X.X.X..", "....X...X.."], ["..X.X.X.X..", "..X.X.X.X.."]],
  };
  function sprite(color, { legs = 2, arms = false, blink = false } = {}) {
    const rows = [...(arms ? FRAMES.arms : FRAMES.body), ...FRAMES.legs[legs]];
    let rects = "";
    rows.forEach((row, y) => [...row].forEach((c, x) => {
      if (c === "X" || (c === "o" && blink)) rects += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${color}"/>`;
      else if (c === "o") rects += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="#1b1b1b"/>`;
    }));
    return `<svg viewBox="0 0 11 8" shape-rendering="crispEdges">${rects}</svg>`;
  }

  const LOCO = ["..XX..........", "..XX....XXXXXX", ".XXXX...XWWWWX", "XXXXXXXXXWWWWX", "XXXXXXXXXXXXXX", "XRXXXXXXXXXXXX",
                "XXXXXXXXXXXXXX", ".OO..OO...OO.."];
  const WAGON = ["............", ".X........X.", ".XXXXXXXXXX.", ".XXXXXXXXXX.", ".XXXXXXXXXX.", "XXXXXXXXXXXX",
                 "XXXXXXXXXXXX", ".OO......OO."];
  function trainSprite(passengers, wheel, wagonColor) {
    const w = 14 + passengers.length * 13, h = 8;
    let r = "";
    const draw = (rows, ox, body) => rows.forEach((row, y) => [...row].forEach((ch, x) => {
      const fill = { X: body, W: "#bfe9ff", R: "#e5484d", O: wheel ? "#2a2f3a" : "#596173" }[ch];
      if (fill) r += `<rect x="${ox + x}" y="${y}" width="1.02" height="1.02" fill="${fill}"/>`;
    }));
    passengers.forEach((color, i) => {
      const ox = i * 13;
      draw(WAGON, ox, wagonColor);
      r += `<rect x="${ox + 3}" y="0" width="6" height="2" fill="${color}"/><rect x="${ox + 4}" y="1" width="1" height="1" fill="#1b1b1b"/>`
         + `<rect x="${ox + 7}" y="1" width="1" height="1" fill="#1b1b1b"/><rect x="${ox + 12}" y="5" width="1" height="1" fill="#596173"/>`;
    });
    draw(LOCO, passengers.length * 13, "#2f3542");
    return `<svg viewBox="0 0 ${w} ${h}" width="${w * 6}" height="${h * 6}" shape-rendering="crispEdges">${r}</svg>`;
  }

  // ---------- default words ----------
  const DEFAULT_LINES = {
    working: ["on it", "almost there", "writing code…", "thinking"],
    fixing: ["fixing it", "found the bug!", "one more try"],
    reviewing: ["under review", "fingers crossed 🤞"],
    waiting: ["zzz", "waiting…"],
    queued: ["got my ticket 🎫", "waiting for the train"],
    idle: ["free!", "anything for me?", "just walking around"],
    boss: ["all good here 👑", "who's free?"],
  };
  const HATS = { fixing: "🔧", reviewing: "🔎", waiting: "💤", queued: "🎫", boss: "👑" };
  const MOUSE = { hello: ["hi! 👋", "hey!"], flee: ["aah!", "too fast!"], pet: ["❤️", "purr"], dance: ["🎶", "let's dance!"],
                  held: ["wheee!", "put me down!"], drop: ["landed!", "again! again!"] };
  const DIALOGS = [
    [["boss", "idle"], ["I've got something for you", "yay! 🎉"]],
    [["boss", "fixing"], ["how's the fix going?", "almost done, boss"]],
    [["boss", "*"], ["all good?", "yes boss! 🫡"]],
    [["fixing", "reviewing"], ["under review too?", "yep, waiting for the verdict"]],
    [["queued", "queued"], ["same train?", "window seat! 🚃"]],
    [["idle", "working"], ["need a hand?", "all good, thanks"]],
    [["idle", "idle"], ["nothing to do either?", "let's wait together ☕"]],
    [["*", "*"], ["hi!", "hi! 👋"]],
  ];

  const pick = a => a[Math.floor(Math.random() * a.length)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const CSS = `
.pc-layer{position:fixed;inset:0;pointer-events:none;z-index:9990;overflow:hidden;font:600 12px/1.3 -apple-system,system-ui,sans-serif}
.pc-critter{position:absolute;left:0;top:0;width:66px;height:66px;pointer-events:auto;cursor:grab;touch-action:none;user-select:none;
  filter:drop-shadow(0 4px 3px rgba(0,0,0,.28));will-change:transform;transition:opacity .35s}
.pc-critter.held{cursor:grabbing;filter:drop-shadow(0 14px 8px rgba(0,0,0,.3));z-index:2}
.pc-critter.bye{opacity:0}
.pc-sprite{position:absolute;left:0;top:18px;width:66px;height:48px}.pc-sprite svg{display:block;width:66px;height:48px}
.pc-hat{position:absolute;top:2px;left:50%;transform:translateX(-50%);font-size:17px;line-height:1}
.pc-tag,.pc-bubble{position:absolute;left:50%;transform:translateX(-50%);white-space:nowrap;padding:4px 9px;border-radius:10px;
  background:var(--pc-bg,#fff);color:var(--pc-fg,#111);border:1px solid rgba(127,127,127,.35);pointer-events:none;box-shadow:0 6px 18px -8px rgba(0,0,0,.4)}
.pc-tag{bottom:-26px;opacity:0;transition:opacity .15s;font-weight:500;font-size:11px}.pc-critter:hover .pc-tag{opacity:1}
.pc-bubble{bottom:68px;opacity:0;transform:translateX(-50%) translateY(6px) scale(.9);transition:opacity .2s,transform .2s}
.pc-bubble.on{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}
.pc-bubble::after{content:"";position:absolute;left:50%;bottom:-6px;margin-left:-5px;border:5px solid transparent;border-top-color:var(--pc-bg,#fff);border-bottom:0}
.pc-train{position:absolute;left:0;top:0;pointer-events:auto;cursor:pointer;filter:drop-shadow(0 4px 3px rgba(0,0,0,.3))}
.pc-train .pc-bubble{bottom:58px;left:70%}
.pc-puff{position:absolute;left:0;top:0;width:12px;height:12px;background:rgba(200,205,215,.75);pointer-events:none;animation:pc-puff 1.6s ease-out forwards}
.pc-puff.red{background:rgba(229,72,77,.8)}
@keyframes pc-puff{to{opacity:0;margin-top:-60px;margin-left:-20px;width:26px;height:26px}}
.pc-banner{position:fixed;left:50%;top:10px;transform:translateX(-50%) translateY(-220%);z-index:9991;max-width:min(760px,90vw);padding:9px 16px;
  border-radius:12px;font-weight:650;font-size:13px;color:#fff;background:#4f6bff;box-shadow:0 12px 30px -12px rgba(0,0,0,.5);
  transition:transform .35s cubic-bezier(.2,.9,.3,1.2);pointer-events:none}
.pc-banner.on{transform:translateX(-50%) translateY(0)}.pc-banner.red{background:#e5484d}.pc-banner.ok{background:#1fb86a}
@media (prefers-color-scheme:dark){.pc-layer,.pc-banner{--pc-bg:#11151d;--pc-fg:#e8ecf3}}`;

  function mount(container = document.body, options = {}) {
    const opts = Object.assign({ top: 0, bottom: 96, lines: DEFAULT_LINES, hats: HATS, wagonColor: "#1fb86a",
                                 talkEvery: [12000, 37000], social: true, onClick: null }, options);
    if (!document.getElementById("pixel-crew-css")) {
      const style = document.createElement("style"); style.id = "pixel-crew-css"; style.textContent = CSS; document.head.appendChild(style);
    }
    const layer = document.createElement("div"); layer.className = "pc-layer"; container.appendChild(layer);
    const banner = document.createElement("div"); banner.className = "pc-banner"; container.appendChild(banner);
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const critters = new Map();
    const mouse = { x: -999, y: -999, speed: 0, t: 0 };
    let env = {}, raf = 0, social = 0;
    const metAt = new Map();
    const onMove = e => {
      const now = performance.now(), dt = Math.max(1, now - mouse.t);
      mouse.speed = Math.hypot(e.clientX - mouse.x, e.clientY - mouse.y) / dt; mouse.x = e.clientX; mouse.y = e.clientY; mouse.t = now;
    };
    addEventListener("pointermove", onMove, { passive: true });

    // ---------- bounds ----------
    const scaleOf = c => c.size === "big" ? 1.3 : c.size === "small" ? 0.78 : 1;
    function bounds(c) {
      const k = scaleOf(c), grow = (66 * k - 66) / 2;
      return { x0: 6 + grow, y0: opts.top + 6 + grow + 18 * k, x1: Math.max(6 + grow, innerWidth - 66 - grow - 10),
               y1: Math.max(opts.top + 6 + grow, innerHeight - 66 - grow - opts.bottom) };
    }
    function clamp(c) {
      const b = bounds(c);
      c.x = Math.min(b.x1, Math.max(b.x0, c.x)); c.y = Math.min(b.y1, Math.max(b.y0, c.y));
      c.tx = Math.min(b.x1, Math.max(b.x0, c.tx)); c.ty = Math.min(b.y1, Math.max(b.y0, c.ty));
    }
    const onResize = () => critters.forEach(clamp);
    addEventListener("resize", onResize);

    // ---------- talking ----------
    function say(c, text, ms = 2800) {
      if (!text) return;
      c.bubble.textContent = text; c.bubble.classList.add("on");
      clearTimeout(c.bubbleTimer); c.bubbleTimer = setTimeout(() => c.bubble.classList.remove("on"), ms);
      c.nextTalk = performance.now() + opts.talkEvery[0] + Math.random() * (opts.talkEvery[1] - opts.talkEvery[0]);
    }
    function lineFor(c) {
      if (env.paused) return pick(["paused ⏸", "taking a break"]);
      if (env.offline && Math.random() < .6) return pick(["no network… 📡", "waiting for internet"]);
      if (env.hot && Math.random() < .5) return env.temp ? `${Math.round(env.temp)}°, so hot 💦` : "so hot 💦";
      if (typeof c.lines === "function") return c.lines(c);
      if (Array.isArray(c.lines) && c.lines.length) return pick(c.lines);
      return pick(opts.lines[c.status] || opts.lines.idle);
    }

    // ---------- critters ----------
    function pickTarget(c) {
      const others = [...critters.values()].filter(o => o !== c && o.mode !== "held");
      if (c.status === "queued") { c.tx = 30 + Math.random() * 160; c.ty = innerHeight - opts.bottom - 60; return; }
      if (opts.social && others.length && Math.random() < .35) {
        const f = pick(others); c.tx = f.x + (Math.random() < .5 ? -70 : 70); c.ty = f.y + Math.random() * 20 - 10; return;
      }
      c.tx = Math.random() * innerWidth; c.ty = Math.random() * innerHeight;
    }
    function spawn(spec) {
      const el = document.createElement("div");
      el.className = "pc-critter";
      el.innerHTML = `<span class="pc-hat"></span><span class="pc-sprite"></span><span class="pc-bubble"></span><span class="pc-tag"></span>`;
      layer.appendChild(el);
      const now = performance.now();
      const c = { el, sprite: el.querySelector(".pc-sprite"), bubble: el.querySelector(".pc-bubble"), x: Math.random() * innerWidth,
                  y: Math.random() * innerHeight, tx: 0, ty: 0, speed: 0.7 + Math.random() * 0.8, legs: 0, tick: 0, dir: 1, mode: "walk",
                  modeLeft: 0, hop: 0, nextBlink: now + 2000 + Math.random() * 4000, blinkLeft: 0, nextTalk: now + 3000 + Math.random() * 8000 };
      Object.assign(c, spec);
      el.onpointerenter = () => { if (c.mode !== "held") { c.mode = "wave"; c.modeLeft = 90; say(c, lineFor(c)); } };
      el.onpointerdown = e => { e.preventDefault(); el.setPointerCapture(e.pointerId);
        c.press = { x: e.clientX, y: e.clientY, ox: e.clientX - c.x, oy: e.clientY - c.y, moved: false }; };
      el.onpointermove = e => {
        if (c.press) {
          if (!c.press.moved && Math.hypot(e.clientX - c.press.x, e.clientY - c.press.y) > 6) {
            c.press.moved = true; c.mode = "held"; el.classList.add("held"); say(c, pick(MOUSE.held), 99999);
          }
          if (c.press.moved) { c.x = e.clientX - c.press.ox; c.y = e.clientY - c.press.oy; clamp(c); c.dir = e.movementX < 0 ? -1 : e.movementX > 0 ? 1 : c.dir; }
          return;
        }
        if (e.movementX || e.movementY) { c.pets = (c.pets || 0) + 1; if (c.pets % 25 === 0) { say(c, pick(MOUSE.pet), 1500); c.hop = 24; } }
      };
      el.onpointerup = () => {
        const dragged = c.press && c.press.moved; c.press = null; el.classList.remove("held");
        if (dragged) { c.mode = "idle"; c.modeLeft = 90; c.hop = 26; c.tx = c.x; c.ty = c.y; say(c, pick(MOUSE.drop), 1600); return; }
        c.hop = 30; (c.onClick || opts.onClick)?.(c.id, c);
      };
      el.ondblclick = () => { c.mode = "dance"; c.modeLeft = 160; say(c, pick(MOUSE.dance)); };
      pickTarget(c); clamp(c); critters.set(spec.id, c); return c;
    }
    function render(c) {
      clamp(c);
      const arms = c.mode === "held" || (c.mode === "wave" ? (c.tick >> 3) % 2 === 0 : c.mode === "dance" ? (c.tick >> 2) % 2 === 0 : false);
      if (c.mode === "held" && c.tick % 5 === 0) c.legs ^= 1;
      const legs = ["walk", "flee", "dance", "held", "chase", "run"].includes(c.mode) ? c.legs : 2;
      const key = `${c.color}${legs}${arms}${c.blinkLeft > 0}`;
      if (key !== c.drawn) { c.sprite.innerHTML = sprite(c.color, { legs, arms, blink: c.blinkLeft > 0 }); c.drawn = key; }
      const hopY = c.hop > 0 ? -Math.sin((c.hop / 30) * Math.PI) * 18 : 0;
      const bob = c.mode === "sleep" ? Math.sin(c.tick / 30) * 1.5 : 0;
      c.el.style.transform = `translate(${c.x}px, ${c.y + hopY + bob}px) scale(${scaleOf(c)})`;
      c.sprite.style.transform = `scaleX(${c.dir})`;
    }
    function step(c, now) {
      c.tick++;
      if (now > c.nextBlink) { c.blinkLeft = 7; c.nextBlink = now + 2500 + Math.random() * 4500; }
      if (c.blinkLeft > 0) c.blinkLeft--;
      if (c.hop > 0) c.hop--;
      if (now > c.nextTalk && !document.hidden) say(c, lineFor(c));
      if (c.mode === "held") return render(c);
      if (env.paused || c.sleeping) { c.mode = "sleep"; return render(c); }
      if (c.mode === "sleep") { c.mode = "walk"; c.hop = 18; pickTarget(c); }
      const md = Math.hypot(mouse.x - (c.x + 33), mouse.y - (c.y + 40));
      if (md < 90 && mouse.speed > 1.2 && !["wave", "flee"].includes(c.mode)) {
        c.mode = "flee"; c.modeLeft = 70; say(c, pick(MOUSE.flee), 1200);
        const a = Math.atan2(c.y - mouse.y, c.x - mouse.x); c.tx = c.x + Math.cos(a) * 260; c.ty = c.y + Math.sin(a) * 200;
      }
      if (c.mode === "talk") { if (c.partner) c.dir = c.partner.x < c.x ? -1 : 1; if (--c.modeLeft <= 0) { c.mode = "walk"; pickTarget(c); } return render(c); }
      if (c.mode === "chase" && c.partner) { c.tx = c.partner.x; c.ty = c.partner.y; if (--c.modeLeft <= 0) { c.mode = "walk"; pickTarget(c); } }
      if (["wave", "dance", "idle"].includes(c.mode)) {
        if (c.mode === "wave") c.dir = mouse.x < c.x + 33 ? -1 : 1;
        if (c.mode === "dance" && c.tick % 12 === 0) { c.dir *= -1; c.hop = c.hop || 20; c.legs ^= 1; }
        if (--c.modeLeft <= 0) { c.mode = "walk"; pickTarget(c); }
        return render(c);
      }
      const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy);
      const pace = env.offline ? .4 : env.hot ? .5 : env.night ? .7 : 1;
      const speed = (c.mode === "flee" ? 4 : c.mode === "chase" || c.mode === "run" ? 2.2 : 1) * c.speed * pace;
      if (c.mode === "run" && --c.modeLeft <= 0) { c.mode = "walk"; pickTarget(c); }
      if (d < 4 || (c.mode === "flee" && --c.modeLeft <= 0)) {
        const r = Math.random();
        c.mode = r < .55 ? "idle" : r < .72 ? "wave" : "dance"; c.modeLeft = 60 + Math.random() * 200; if (r > .85) c.hop = 30;
        return render(c);
      }
      c.x += dx / d * speed; c.y += dy / d * speed; c.dir = dx < 0 ? -1 : 1;
      if (c.tick % (c.mode === "flee" ? 4 : 9) === 0) c.legs ^= 1;
      render(c);
    }

    // ---------- meeting each other ----------
    function dialog(a, b) {
      for (const [[x, y], lines] of DIALOGS) {
        if ((x === "*" || x === a.status) && (y === "*" || y === b.status)) return [a, b, lines];
        if ((x === "*" || x === b.status) && (y === "*" || y === a.status)) return [b, a, lines];
      }
    }
    function meet(a, b, now) {
      const key = [a.id, b.id].sort().join("|");
      if (now - (metAt.get(key) || 0) < 40000) return;
      metAt.set(key, now);
      const free = c => !c.sleeping && !["held", "talk", "flee", "chase"].includes(c.mode);
      if (!!a.sleeping !== !!b.sleeping) {
        const [awake, sleeper] = a.sleeping ? [b, a] : [a, b];
        if (!free(awake)) return;
        Object.assign(awake, { mode: "talk", modeLeft: 120, partner: sleeper }); say(awake, "wake up! ⏰", 1600);
        sleeper.hop = 20; setTimeout(() => say(sleeper, "zzz… five more minutes", 1800), 900); return;
      }
      if (!free(a) || !free(b)) return;
      const r = Math.random();
      if (r < .5) {
        const [first, second, lines] = a.color === b.color ? [a, b, ["hey twin! 🤝", "same color, same family"]] : dialog(a, b);
        for (const c of [first, second]) Object.assign(c, { mode: "talk", modeLeft: 190, partner: c === first ? second : first });
        say(first, lines[0], 2200); setTimeout(() => say(second, lines[1], 2200), 1300);
      } else if (r < .7) {
        for (const c of [a, b]) Object.assign(c, { mode: "wave", modeLeft: 60, hop: 26 }); say(a, "🙌", 1200); say(b, "🙌", 1200);
      } else if (r < .85) {
        for (const c of [a, b]) Object.assign(c, { mode: "dance", modeLeft: 150 }); say(a, "🎶 dance?", 1500); setTimeout(() => say(b, "wheee 💃", 1500), 700);
      } else {
        Object.assign(a, { mode: "chase", modeLeft: 160, partner: b }); say(a, "tag, you're it! 🏃", 1400);
        Object.assign(b, { mode: "run", modeLeft: 160 }); say(b, "can't catch me!", 1400);
        const ang = Math.atan2(b.y - a.y, b.x - a.x); b.tx = b.x + Math.cos(ang) * 320; b.ty = b.y + Math.sin(ang) * 220;
      }
    }

    // ---------- train ----------
    const train = { el: null, x: 0, members: [], state: "none", tick: 0, red: 0, sayLeft: 0, say: "" };
    function setTrain(spec) {
      const members = spec && spec.members ? spec.members : [];
      if (members.length && train.state !== "run") {
        if (!train.el) { train.el = document.createElement("div"); train.el.className = "pc-train"; layer.appendChild(train.el); }
        train.state = "run"; train.x = -60 - members.length * 78;
      }
      if (!members.length && train.state === "run") {
        train.state = "leave"; if (spec && spec.say) { train.say = spec.say; train.sayLeft = 220; }
      }
      if (members.length) train.members = members.map(m => typeof m === "string" ? (critters.get(m)?.color || "#d77757") : m.color || m);
      if (spec && spec.red) { train.red = 260; if (spec.say) { train.say = spec.say; train.sayLeft = 260; } }
    }
    function stepTrain() {
      if (train.red > 0 && (!train.el || train.state === "none")) {
        train.el = document.createElement("div"); train.el.className = "pc-train"; layer.appendChild(train.el);
        train.state = "leave"; train.x = innerWidth / 2 - 120; if (!train.members.length) train.members = ["#999"];
      }
      if (!train.el || train.state === "none") return;
      train.tick++;
      if (train.red > 0) train.red--;
      const width = (14 + train.members.length * 13) * 6;
      if (train.state === "run" && !train.red) { train.x += 0.9; if (train.x > innerWidth + 20) train.x = -width; }
      else if (train.state === "leave" && !train.red) {
        train.x += 6; if (train.x > innerWidth + 40) { train.el.remove(); train.el = null; train.state = "none"; return; }
      }
      if (train.tick % 6 === 0) train.el.innerHTML = trainSprite(train.members, (train.tick >> 3) % 2, opts.wagonColor)
        + (train.sayLeft > 0 ? `<span class="pc-bubble on">${esc(train.say)}</span>` : "");
      if (train.sayLeft > 0) train.sayLeft--;
      train.el.style.transform = `translate(${train.x}px, ${innerHeight - 78}px)`;
      if (train.tick % 14 === 0 && !still) {
        const puff = document.createElement("div"); puff.className = "pc-puff" + (train.red ? " red" : "");
        puff.style.transform = `translate(${train.x + width - 62}px, ${innerHeight - 92}px)`; layer.appendChild(puff);
        setTimeout(() => puff.remove(), 1600);
      }
    }

    function loop(now) {
      if (!still) {
        if (opts.social && ++social % 10 === 0) {
          const list = [...critters.values()];
          for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++)
            if (Math.hypot(list[i].x - list[j].x, list[i].y - list[j].y) < 85) meet(list[i], list[j], now);
        }
        critters.forEach(c => step(c, now)); stepTrain();
      } else critters.forEach(render);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    // ---------- public API ----------
    const crew = {
      /** Replace the crew: [{id, color, status, label, lines, hat, size, sleeping, onClick}] plus optional train and env. */
      update(state = {}) {
        if (state.env) crew.env(state.env);
        const want = new Map((state.critters || []).map(c => [String(c.id), c]));
        for (const [id, c] of critters) if (!want.has(id)) { c.el.classList.add("bye"); setTimeout(() => c.el.remove(), 400); critters.delete(id); }
        for (const [id, spec] of want) {
          const c = critters.get(id) || spawn({ id, color: spec.color || "#d77757", status: spec.status || "idle" });
          const changed = c.status !== (spec.status || "idle");
          Object.assign(c, { color: spec.color || c.color, status: spec.status || "idle", lines: spec.lines, size: spec.size,
                             sleeping: !!spec.sleeping || spec.status === "waiting", onClick: spec.onClick });
          c.el.querySelector(".pc-hat").textContent = spec.hat ?? opts.hats[c.status] ?? "";
          c.el.querySelector(".pc-tag").textContent = spec.label || id;
          if (changed && c.tick) { c.hop = 30; say(c, spec.statusLine || lineFor(c)); pickTarget(c); }
        }
        if ("train" in state) setTrain(state.train);
        for (const e of state.events || []) if (!crew._seen || (e.at || 0) > crew._seen) { crew._seen = e.at || Date.now() / 1000; crew.event(e); }
      },
      say(id, text, ms) { const c = critters.get(String(id)); if (c) say(c, text, ms); },
      /** {paused, offline, hot, temp, night} */
      env(next) { env = Object.assign({}, next); },
      /** Show a banner and let the crew react. kind: "red" | "ok" | "info". */
      event({ kind = "info", text = "", ids = [] } = {}) {
        banner.className = `pc-banner ${kind === "red" ? "red" : kind === "ok" ? "ok" : ""} on`; banner.textContent = text;
        clearTimeout(crew._bt); crew._bt = setTimeout(() => banner.classList.remove("on"), 9000);
        for (const id of ids) { const c = critters.get(String(id)); if (c) { c.hop = 30; say(c, kind === "red" ? "uh oh 😟" : kind === "ok" ? "yes! 🎉" : "👀", 3000); } }
        if (kind === "red" && train.state !== "none") { train.red = 260; train.say = text; train.sayLeft = 260; }
      },
      critters, destroy() {
        cancelAnimationFrame(raf); removeEventListener("pointermove", onMove); removeEventListener("resize", onResize);
        layer.remove(); banner.remove();
      },
    };
    return crew;
  }

  return { mount, sprite, trainSprite, DEFAULT_LINES };
});
