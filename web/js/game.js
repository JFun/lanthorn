/* Lanthorn — UI + flow. One verb: drag a piece from the hand onto the board.
   Screens: title → game / sky; progression is linear (the Play button is the
   level odometer — no level browser, per genre convention). Progress in
   localStorage. Engine is pure (js/engine.js); this file owns DOM, drag,
   juice and the meta sky. */
(function () {
  "use strict";
  const E = globalThis.LanthornEngine;
  const LEVELS = globalThis.LANTHORN_LEVELS;
  const SDK = globalThis.LanthornSDK;
  const N = E.N;
  const $ = (id) => document.getElementById(id);
  const DEBUG = location.search.includes("debug=1");

  // ---------- persistence ----------
  const SAVE_KEY = "lanthorn.v1";
  let store = { won: [], sound: true, bgm: true, haptics: true, tutDone: false };
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && Array.isArray(s.won)) store = Object.assign(store, s);
  } catch (e) {}
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(store)); } catch (e) {} }
  function skyTotal() { return LEVELS.reduce((n, lv, i) => n + (store.won[i] ? lv.lanterns.length : 0), 0); }
  function firstOpen() { for (let i = 0; i < LEVELS.length; i++) if (!store.won[i]) return i; return LEVELS.length - 1; }

  Snd.muted = !store.sound;
  Snd.haptics = store.haptics;

  // ---------- screens ----------
  const screens = { title: $("scr-title"), game: $("scr-game"), sky: $("scr-sky") };
  let current = "title";
  function quitTelemetry() {   // leaving an unfinished level = a quit (heatmap source)
    if (current === "game" && g && !g.over) {
      Track.ev("level_quit", { level: g.level.id, lit: g.lanterns.filter(l => l.lit).length });
    }
  }
  function show(name) {
    if (current === "game" && name !== "game") { quitTelemetry(); SDK.gameplayStop(); }
    current = name;
    closeMenu();
    for (const k in screens) screens[k].classList.toggle("active", k === name);
    // the settings gear lives on home AND in the game HUD — one menu, moved
    if (name === "title") $("titleMenuSlot").appendChild($("menuWrap"));
    else if (name === "game") $("hudMenuSlot").appendChild($("menuWrap"));
    $("btnHome").style.display = name === "title" ? "none" : "";  // ⌂ is noise on home
    FX.setScene(name, { skyCount: skyTotal() });
    if (name === "title") {
      // the Play button is the level odometer (Royal Match pattern)
      $("btnPlay").textContent = store.won[LEVELS.length - 1] ? "Play again" : "Level " + (firstOpen() + 1);
      $("btnSkyLabel").textContent = skyTotal() ? `Night sky · ${skyTotal()}` : "Night sky";
    }
    if (name === "sky") $("skyCount").innerHTML = skyTotal()
      ? `<b>${skyTotal()}</b> lantern${skyTotal() === 1 ? "" : "s"} released into your sky`
      : "Your sky is waiting — light some lanterns.";
  }

  // ---------- layout ----------
  function layout() {
    const cell = Math.max(30, Math.min(52,
      Math.floor((innerWidth - 44) / N),
      Math.floor((innerHeight - 252) / N)));
    document.documentElement.style.setProperty("--cell", cell + "px");
  }

  // ---------- board ----------
  const boardEl = $("board"), trayEl = $("tray"), ghost = $("ghost");
  const cells = [];
  function buildBoard() {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const d = document.createElement("div");
      d.className = "cell";
      boardEl.appendChild(d); cells.push(d);
    }
  }

  let g = null, levelIdx = 0;
  const released = new Set();   // lanterns that already floated up this level
  let uiSlots = [0, 1, 2];      // tray slot → hand index; pieces keep their slot until used

  function startLevel(i) {
    quitTelemetry();             // restarting mid-level also abandons a run
    levelIdx = i;
    g = E.newGame(LEVELS[i]);
    released.clear();
    uiSlots = [0, 1, 2];
    $("nospace").classList.remove("show");
    hideOverlay();
    show("game");
    render();
    SDK.gameplayStart();
    Track.ev("level_start", { level: g.level.id });
  }

  function render(flash) {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const d = cells[r * N + c];
      let cls = "cell";
      const v = g.grid[r][c];
      if (v === E.WALL) cls += " wall";
      if (v === E.FILLED) cls += " filled";
      if (flash && (flash.rows.includes(r) || flash.cols.includes(c)) && v !== E.WALL) cls += " flash";
      const ln = g.lanterns.find(l => l.r === r && l.c === c);
      let inner = "";
      if (ln) {
        if (released.has(r + "," + c)) cls += " released";
        else inner = `<div class="lan${ln.lit ? " lit-lan" : ""}"></div>`;
      }
      d.className = cls;
      if (d.innerHTML !== inner) d.innerHTML = inner;
    }
    trayEl.innerHTML = "";
    for (let s = 0; s < 3; s++) {
      const slot = document.createElement("div");
      slot.className = "slot";
      const h = uiSlots[s];
      if (h !== null && g.hand[h] !== undefined) {
        const pieceEl = makePieceEl(g.hand[h], h);
        slot.appendChild(pieceEl);
        slot.addEventListener("pointerdown", ev => startDrag(ev, pieceEl));
      }
      trayEl.appendChild(slot);
    }
    $("hudLevel").textContent = "Level " + g.level.id;
    $("hudDots").innerHTML = g.lanterns.map(l => `<span class="dot${l.lit ? " on" : ""}"></span>`).join("");
    $("tut").style.display = store.tutDone ? "none" : "";
  }

  function makePieceEl(shapeKey, handIdx) {
    const arr = E.SHAPES[shapeKey];
    const maxR = Math.max(...arr.map(x => x[0])) + 1;
    const maxC = Math.max(...arr.map(x => x[1])) + 1;
    const el = document.createElement("div");
    el.className = "piece"; el.dataset.idx = handIdx; el.dataset.shape = shapeKey;
    // uniform mini-cell that lets even a 5-long piece fit its third-width slot
    const slotW = (cellPx() * 8 + 41 - 20) / 3;
    const mini = Math.max(14, Math.floor(Math.min(cellPx() * 0.52, (slotW - 12) / 5)));
    el.style.gridTemplateRows = `repeat(${maxR}, ${mini}px)`;
    el.style.gridTemplateColumns = `repeat(${maxC}, ${mini}px)`;
    const set = new Set(arr.map(x => x[0] + "," + x[1]));
    for (let r = 0; r < maxR; r++) for (let c = 0; c < maxC; c++) {
      const d = document.createElement("div");
      d.className = set.has(r + "," + c) ? "pc" : "hidden";
      el.appendChild(d);
    }
    return el;   // pickup is handled by the parent slot (bigger touch target)
  }

  // ---------- drag ----------
  function cellPx() { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cell")); }
  function lift() { return Math.max(64, cellPx() * 1.6); }
  let drag = null;

  function startDrag(ev, el) {
    if (!g || g.over || drag) return;
    ev.preventDefault();
    const shapeKey = el.dataset.shape, handIdx = +el.dataset.idx;
    const arr = E.SHAPES[shapeKey];
    const maxR = Math.max(...arr.map(x => x[0])) + 1;
    const maxC = Math.max(...arr.map(x => x[1])) + 1;
    const cs = cellPx(), gap = 3;
    ghost.innerHTML = "";
    ghost.style.display = "grid";
    ghost.style.gridTemplateRows = `repeat(${maxR}, ${cs}px)`;
    ghost.style.gridTemplateColumns = `repeat(${maxC}, ${cs}px)`;
    ghost.style.gap = gap + "px";
    const set = new Set(arr.map(x => x[0] + "," + x[1]));
    for (let r = 0; r < maxR; r++) for (let c = 0; c < maxC; c++) {
      const d = document.createElement("div");
      d.className = set.has(r + "," + c) ? "pc" : "hidden";
      if (d.className === "pc") { d.style.width = cs + "px"; d.style.height = cs + "px"; }
      ghost.appendChild(d);
    }
    el.classList.add("used");
    drag = { shapeKey, handIdx, el, cs, gap };
    moveDrag(ev);
    window.addEventListener("pointermove", moveDrag);
    window.addEventListener("pointerup", endDrag, { once: true });
    window.addEventListener("pointercancel", cancelDrag, { once: true });
  }

  // anchor = board cell under the shape's top-left cell center (finger, lifted)
  function anchorAt(ev) {
    const p = { x: ev.clientX, y: ev.clientY - lift() };
    const r0 = cells[0].getBoundingClientRect();
    const pitch = drag.cs + drag.gap;
    const c = Math.floor((p.x - r0.left) / pitch);
    const r = Math.floor((p.y - r0.top) / pitch);
    if (r < 0 || c < 0 || r >= N || c >= N) return null;
    return { r, c };
  }

  function moveDrag(ev) {
    if (!drag) return;
    for (const d of cells) d.classList.remove("ok", "bad");
    const at = anchorAt(ev);
    let snapped = false;
    if (at) {
      const legal = E.canPlace(g, drag.shapeKey, at.r, at.c);
      for (const [dr, dc] of E.SHAPES[drag.shapeKey]) {
        const rr = at.r + dr, cc = at.c + dc;
        if (rr < N && cc < N) cells[rr * N + cc].classList.add(legal ? "ok" : "bad");
      }
      if (legal) {  // snap ghost onto the exact cells
        const rect = cells[at.r * N + at.c].getBoundingClientRect();
        ghost.style.left = rect.left + "px";
        ghost.style.top = rect.top + "px";
        snapped = true;
      }
    }
    ghost.classList.toggle("snap", snapped);
    if (!snapped) {
      ghost.style.left = (ev.clientX - drag.cs / 2) + "px";
      ghost.style.top = (ev.clientY - lift() - drag.cs / 2) + "px";
    }
  }

  function cancelDrag() {
    if (!drag) return;
    window.removeEventListener("pointermove", moveDrag);
    ghost.style.display = "none";
    for (const d of cells) d.classList.remove("ok", "bad");
    drag.el.classList.remove("used");
    drag = null;
  }

  function endDrag(ev) {
    if (!drag) return;
    window.removeEventListener("pointermove", moveDrag);
    ghost.style.display = "none";
    for (const d of cells) d.classList.remove("ok", "bad");
    const at = anchorAt(ev);
    const usedIdx = drag.handIdx;
    const res = at && E.place(g, usedIdx, at.r, at.c);
    if (!res) drag.el.classList.remove("used");
    drag = null;
    if (!res) return;

    // keep remaining pieces in their slots; engine hand indexes shifted down
    if (g.hand.length === 3) uiSlots = [0, 1, 2];          // hand was emptied → refilled
    else uiSlots = uiSlots.map(v => v === usedIdx ? null : (v !== null && v > usedIdx ? v - 1 : v));

    Snd.tap();
    const litNow = res.lit.slice();
    render(res.cleared);
    const nLines = res.cleared.rows.length + res.cleared.cols.length;
    if (nLines) {
      Snd.clear(nLines);
      const rects = [];
      for (const r of res.cleared.rows) for (let c = 0; c < N; c++) rects.push(cells[r * N + c].getBoundingClientRect());
      for (const c of res.cleared.cols) for (let r = 0; r < N; r++) rects.push(cells[r * N + c].getBoundingClientRect());
      FX.sparkCells(rects);
      boardEl.classList.add("pulse");
      setTimeout(() => boardEl.classList.remove("pulse"), 130);
    }
    for (const ln of litNow) {
      Snd.lantern();
      const rect = cells[ln.r * N + ln.c].getBoundingClientRect();
      setTimeout(() => {
        FX.floatLantern(rect);
        released.add(ln.r + "," + ln.c);
        if (!g.over || g.won) render();
      }, 240);
    }
    if (litNow.length && !store.tutDone) { store.tutDone = true; save(); $("tut").classList.add("gone"); }
    if (g.over) {
      if (g.won) setTimeout(showEnd, 1000);
      else {                                  // staged beat: sweep + flicker, then card
        setTimeout(failMoment, 250);
        setTimeout(showEnd, 1900);
      }
    }
  }

  // The "no space left" moment (Block Blast staging): the jammed board stays
  // visible, the verdict sweeps in, the unlit lanterns flicker out.
  function failMoment() {
    if (!g || !g.over || g.won) return;
    closeMenu();
    Snd.fail();
    $("nospace").classList.add("show");
    for (const ln of g.lanterns) {
      if (ln.lit) continue;
      const lanEl = cells[ln.r * N + ln.c].querySelector(".lan");
      if (lanEl) lanEl.classList.add("flicker");
    }
  }

  // ---------- overlays ----------
  const overlay = $("overlay");
  function hideOverlay() { overlay.classList.remove("show", "winlight"); }
  // End card, Royal Match shape: level banner on top, one celebratory line,
  // lantern centerpiece with the sky reward, a single Continue, X to close.
  // Both end cards are wordless and mirrored: win = lit lantern + reward
  // badge; fail = the same lantern unlit, swaying, over a dots row showing
  // how close the run got.
  function showEnd() {
    const t = $("ovTitle"), p = $("ovText"), b = $("ovBtns");
    const hero = $("ovHero"), heroLan = hero.querySelector(".lan");
    const badge = $("ovBadge"), dots = $("ovDots");
    closeMenu();
    overlay.classList.add("show");
    $("ovLevel").textContent = "Level " + g.level.id;
    b.innerHTML = "";
    t.textContent = ""; p.textContent = "";
    t.style.display = "none"; p.style.display = "none";
    hero.style.display = "block";
    SDK.gameplayStop();
    if (g.won) {
      overlay.classList.add("winlight");
      Track.ev("level_win", { level: g.level.id, pieces: g.piecesUsed, first: !store.won[levelIdx] });
      store.won[levelIdx] = true; save();
      Snd.win(); SDK.happytime();
      FX.celebrate(boardEl.getBoundingClientRect());
      hero.classList.remove("sad");
      heroLan.classList.add("lit-lan");
      badge.style.display = "";
      badge.textContent = "+" + g.level.lanterns.length;
      dots.style.display = "none";
      if (levelIdx < LEVELS.length - 1) {
        addBtn(b, "Continue", () => { Snd.ui(); startLevel(levelIdx + 1); }, "primary wide");
      } else {
        addBtn(b, "See your sky", () => { Snd.ui(); hideOverlay(); show("sky"); }, "primary wide");
      }
    } else {
      Track.ev("level_fail", { level: g.level.id, lit: g.lanterns.filter(l => l.lit).length,
                               lanterns: g.lanterns.length });
      $("nospace").classList.remove("show");
      hero.classList.add("sad");
      heroLan.classList.remove("lit-lan");
      badge.style.display = "none";
      dots.style.display = "flex";
      dots.innerHTML = g.lanterns.map(l => `<span class="dot${l.lit ? " on" : ""}"></span>`).join("");
      addBtn(b, "Retry", () => { Snd.ui(); startLevel(levelIdx); }, "primary wide");
    }
  }
  function addBtn(parent, label, fn, cls) {
    const btn = document.createElement("button");
    if (cls) btn.className = cls;
    btn.textContent = label;
    btn.addEventListener("click", fn);
    parent.appendChild(btn);
  }

  // ---------- wiring ----------
  $("btnPlay").addEventListener("click", () => { Snd.ui(); startLevel(firstOpen()); });
  $("btnSky").addEventListener("click", () => { Snd.ui(); show("sky"); });
  $("btnSkyHome").addEventListener("click", () => { Snd.ui(); show("title"); });
  // in-game gear menu (genre convention: one visible control, rest collapsed)
  const menuWrap = $("menuWrap");
  function closeMenu() { menuWrap.classList.remove("open"); }
  $("btnMenu").addEventListener("click", () => { Snd.ui(); menuWrap.classList.toggle("open"); });
  document.addEventListener("pointerdown", e => { if (!menuWrap.contains(e.target)) closeMenu(); });
  $("btnHome").addEventListener("click", () => { Snd.ui(); closeMenu(); hideOverlay(); show("title"); });
  // X on the end card → home, same exit as the HUD ⌂ (title is the hub:
  // Play continues, Levels/Sky one tap away, released lanterns visible).
  $("ovClose").addEventListener("click", () => { Snd.ui(); hideOverlay(); show("title"); });
  // settings toggles (menu stays open so the state flip is visible)
  function syncToggles() {
    $("btnMute").classList.toggle("off", !store.sound);
    $("btnBgm").classList.toggle("off", !store.bgm);
    $("btnVib").classList.toggle("off", !store.haptics);
  }
  $("btnMute").addEventListener("click", () => {
    store.sound = !store.sound; Snd.muted = !store.sound; save(); syncToggles(); Snd.ui();
  });
  $("btnBgm").addEventListener("click", () => {
    store.bgm = !store.bgm; save(); syncToggles();
    if (store.bgm) Snd.bgmOn(); else Snd.bgmOff();
    Snd.ui();
  });
  $("btnVib").addEventListener("click", () => {
    store.haptics = !store.haptics; Snd.haptics = store.haptics; save(); syncToggles();
    if (store.haptics) Snd.testBuzz();   // a little "it works" tap
    Snd.ui();
  });
  syncToggles();

  document.addEventListener("contextmenu", e => { if (current === "game") e.preventDefault(); });
  window.addEventListener("pagehide", quitTelemetry);   // closing the tab mid-level counts too
  window.addEventListener("resize", layout);
  window.addEventListener("keydown", e => {
    if (!DEBUG || current !== "game") return;
    if (e.key === "n" && levelIdx < LEVELS.length - 1) startLevel(levelIdx + 1);
    if (e.key === "p" && levelIdx > 0) startLevel(levelIdx - 1);
  });

  // ---------- debug hooks (?debug=1) for dev + screenshot harness ----------
  if (DEBUG) {
    window.LD = {
      goto: n => startLevel(n - 1),
      winNow() { g.lanterns.forEach(l => l.lit = true); g.over = true; g.won = true; render(); showEnd(); },
      failNow(unlit) {
        const k = unlit === undefined ? 2 : unlit;   // leave k lanterns unlit, force the card
        g.lanterns.forEach((l, i) => l.lit = i < g.lanterns.length - k);
        g.over = true; g.won = false; render(); showEnd();
      },
      moment(unlit) {  // the "no space left" sweep only (for eyeballing the beat)
        const k = unlit === undefined ? 2 : unlit;
        g.lanterns.forEach((l, i) => l.lit = i < g.lanterns.length - k);
        g.over = true; g.won = false; render(); failMoment();
      },
      winLevels(n) { for (let i = 0; i < n; i++) store.won[i] = true; save(); },
      reset() { localStorage.removeItem(SAVE_KEY); location.reload(); },
      state: () => ({ levelIdx, over: g && g.over, won: g && g.won, hand: g && g.hand }),
      game: () => g,
      render: () => render()
    };
  }

  // ---------- boot ----------
  SDK.init();
  SDK.loadingStart();
  layout();
  buildBoard();
  FX.init($("bg"), $("fx"));
  show("title");
  if (store.bgm) Snd.bgmOn();   // native: starts now; web: after first gesture
  SDK.loadingStop();
})();
