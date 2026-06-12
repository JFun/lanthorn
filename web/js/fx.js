/* Lanthorn FX — two full-screen canvases:
   #bg (behind UI): twinkling stars + ambient sky lanterns on title/sky screens.
   #fx (above UI, pointer-events none): line-clear sparks, lantern float-ups,
   win celebration. All shapes drawn in code; no assets. */
(function (root) {
  "use strict";
  const FX = {};
  let bg, fx, bgx, fxx, W = 0, H = 0, DPR = 1;
  let scene = "title";
  let ambientTarget = 0;

  const stars = [];
  const ambient = [];   // drifting sky lanterns (bg canvas)
  const sparks = [];    // particles (fx canvas)
  const floaters = [];  // lanterns rising from the board (fx canvas)
  let rngSeed = 9;
  function rnd() { rngSeed = (rngSeed * 1664525 + 1013904223) >>> 0; return rngSeed / 4294967296; }

  FX.init = function (bgCanvas, fxCanvas) {
    bg = bgCanvas; fx = fxCanvas;
    bgx = bg.getContext("2d"); fxx = fx.getContext("2d");
    resize();
    root.addEventListener("resize", resize);
    for (let i = 0; i < 130; i++) {
      stars.push({ x: rnd(), y: rnd(), r: 0.5 + rnd() * 1.3, ph: rnd() * Math.PI * 2, sp: 0.4 + rnd() * 1.2 });
    }
    requestAnimationFrame(tick);
  };

  function resize() {
    DPR = Math.min(2, root.devicePixelRatio || 1);
    W = root.innerWidth; H = root.innerHeight;
    for (const c of [bg, fx]) { c.width = W * DPR; c.height = H * DPR; }
    bgx.setTransform(DPR, 0, 0, DPR, 0, 0);
    fxx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  FX.setScene = function (name, opts) {
    scene = name;
    if (name === "sky") ambientTarget = Math.min(48, (opts && opts.skyCount) || 0);
    else if (name === "title") ambientTarget = Math.min(10, 2 + ((opts && opts.skyCount) || 0));
    else ambientTarget = 0;
    // Lanterns released in past sessions are already aloft — scatter them
    // across the sky instead of queueing them all at the bottom edge.
    while (ambient.length < ambientTarget) spawnAmbient(false);
  };

  function spawnAmbient(fromBottom) {
    ambient.push({
      x: 0.06 + rnd() * 0.88,
      y: fromBottom ? 1.08 : rnd(),
      s: 9 + rnd() * 13,
      vy: 0.012 + rnd() * 0.02,           // screen-fractions per second
      sway: 6 + rnd() * 14,
      ph: rnd() * Math.PI * 2,
      tw: 0.6 + rnd() * 0.8
    });
  }

  // A paper lantern, drawn in code. (x,y) = center, s = body height.
  function drawLantern(ctx, x, y, s, alpha, t) {
    if (!(s > 0.5) || !isFinite(x + y)) return;   // never feed bad radii to ellipse()
    alpha = Math.max(0, Math.min(1, alpha));
    const w = s * 0.78, flick = 1 + 0.06 * Math.sin(t * 7 + x);
    ctx.save();
    ctx.globalAlpha = alpha;
    // halo
    const halo = ctx.createRadialGradient(x, y, s * 0.1, x, y, s * 1.9);
    halo.addColorStop(0, "rgba(255,185,84,0.34)");
    halo.addColorStop(1, "rgba(255,185,84,0)");
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(x, y, s * 1.9, 0, Math.PI * 2); ctx.fill();
    // body
    const bodyGrad = ctx.createRadialGradient(x, y - s * 0.18, s * 0.08, x, y, s * 0.85);
    bodyGrad.addColorStop(0, "#fff0c8");
    bodyGrad.addColorStop(0.55, "#ffb95e");
    bodyGrad.addColorStop(1, "#c97a2e");
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(x, y, (w / 2) * flick, s / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    // ribs
    ctx.strokeStyle = "rgba(140,70,10,0.30)";
    ctx.lineWidth = Math.max(0.6, s * 0.03);
    for (const k of [-0.45, 0, 0.45]) {
      ctx.beginPath();
      ctx.ellipse(x + (w / 2) * k * 0.8, y, (w / 2) * Math.sqrt(1 - k * k) * 0.5, s / 2, 0, Math.PI * 0.5, Math.PI * 1.5);
      ctx.stroke();
    }
    // cap
    ctx.fillStyle = "#232741";
    ctx.fillRect(x - w * 0.18, y - s * 0.62, w * 0.36, s * 0.14);
    ctx.restore();
  }

  // ---------- public effect triggers ----------
  FX.sparkCells = function (rects) {
    for (const r of rects) {
      for (let i = 0; i < 3; i++) {
        sparks.push({
          x: r.left + rnd() * r.width, y: r.top + rnd() * r.height,
          vx: (rnd() - 0.5) * 140, vy: -30 - rnd() * 120,
          life: 0, max: 0.5 + rnd() * 0.45, r: 1.4 + rnd() * 2.4
        });
      }
    }
    if (sparks.length > 400) sparks.splice(0, sparks.length - 400);
  };

  FX.floatLantern = function (rect) {
    floaters.push({
      x: rect.left + rect.width / 2, y: rect.top + rect.height / 2,
      s: rect.height * 0.62, t: 0, dur: 2.1, ph: rnd() * Math.PI * 2
    });
    if (floaters.length > 24) floaters.splice(0, floaters.length - 24);
  };

  FX.celebrate = function (originRect) {
    const cx = originRect ? originRect.left + originRect.width / 2 : W / 2;
    const cy = originRect ? originRect.top : H * 0.4;
    for (let i = 0; i < 44; i++) {
      const a = rnd() * Math.PI * 2, v = 60 + rnd() * 220;
      sparks.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80,
                    life: 0, max: 0.7 + rnd() * 0.7, r: 1.6 + rnd() * 2.6 });
    }
    if (sparks.length > 400) sparks.splice(0, sparks.length - 400);
  };

  // live handles for the dev/verification harness
  FX._debug = { sparks, floaters };

  // ---------- frame loop ----------
  // iOS WKWebView can restart the rAF timebase after the app is suspended, so
  // the delta must never be trusted blindly: negative/NaN/huge dt turns the
  // particle math inside out (immortal sparks inflating into amber blobs,
  // floaters frozen mid-rise). Guard dt, reset on visibility changes, and
  // never let one bad frame kill the loop.
  let last = -1;
  function tick(ts) {
    try {
      frame(ts);
    } catch (e) { /* skip the frame; the loop must survive */ }
    requestAnimationFrame(tick);
  }
  function frame(ts) {
    const t = ts / 1000;
    let dt = last < 0 ? 0.016 : t - last;
    if (!(dt > 0)) dt = 0.016;
    dt = Math.min(dt, 0.05);
    last = t;

    // bg: stars + ambient lanterns
    bgx.clearRect(0, 0, W, H);
    for (const s of stars) {
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph));
      bgx.globalAlpha = tw;
      bgx.fillStyle = "#cdd6ff";
      bgx.beginPath(); bgx.arc(s.x * W, s.y * H * 0.9, s.r, 0, Math.PI * 2); bgx.fill();
    }
    bgx.globalAlpha = 1;
    while (ambient.length < ambientTarget) spawnAmbient(ambient.length > 4);
    while (ambient.length > ambientTarget) ambient.shift();
    for (const a of ambient) {
      a.y -= a.vy * dt;
      if (a.y < -0.12) { a.y = 1.08; a.x = 0.06 + rnd() * 0.88; }
      drawLantern(bgx, a.x * W + Math.sin(t * a.tw + a.ph) * a.sway, a.y * H, a.s, 0.8, t);
    }

    // fx: sparks + floaters
    fxx.clearRect(0, 0, W, H);
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.life += dt;
      if (p.life >= p.max || p.life < 0) { sparks.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 110 * dt;
      const k = Math.max(0, Math.min(1, 1 - p.life / p.max));
      fxx.globalAlpha = k;
      fxx.fillStyle = k > 0.55 ? "#fff0c8" : "#ffb95e";
      fxx.beginPath(); fxx.arc(p.x, p.y, p.r * (0.6 + 0.4 * k), 0, Math.PI * 2); fxx.fill();
    }
    fxx.globalAlpha = 1;
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.t += dt;
      const k = f.t / f.dur;
      if (k >= 1 || k < 0) { floaters.splice(i, 1); continue; }
      const ease = 1 - Math.pow(1 - k, 2.4);
      const y = f.y - ease * (f.y + f.s * 3);
      const x = f.x + Math.sin(f.t * 2.2 + f.ph) * 12 * k;
      drawLantern(fxx, x, y, f.s * (1 + 0.25 * k), Math.min(1, 3 - 3 * k), t);
    }
  }

  // App suspension: transient FX are sub-3s effects — drop them and restart
  // the clock instead of resuming into a stale timeline.
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      last = -1;
      sparks.length = 0;
      floaters.length = 0;
    });
  }

  root.FX = FX;
})(typeof globalThis !== "undefined" ? globalThis : this);
