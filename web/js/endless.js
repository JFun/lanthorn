/* Lanthorn endless tail — levels past the 60 curated ones are generated here,
   so the odometer never hits a wall and the night sky fills forever (the
   Block Blast "endless alongside designed" model). Each level number maps
   DETERMINISTICALLY to one board (same seed every player, same as a designed
   level — "a level is a designed object, not a slot machine"), validated
   solvable + kind via the same engine the curated set was built with.
   Difficulty holds at a cozy band-C plateau (no brutal ramp) with an
   archetype-A breather every 10th. Faithful port of scripts/dev/gen-levels.cjs
   geometry. */
(function (root) {
  "use strict";
  const E = root.LanthornEngine;
  const N = E.N;
  const MAX_BLOCKED = 14;
  const CYCLE = ["C", "D", "E", "F", "B"];   // archetypes, mirrors the band-C curated cycle
  const cache = {};

  function genLevel(n) {                       // n is the 1-based level number (>60)
    if (cache[n]) return cache[n];
    // deterministic per-n RNG: hash n so adjacent levels don't look alike
    const rng = E.makeRNG((Math.imul(n, 2654435761) ^ 0x9e3779b9) >>> 0);
    const rInt = m => Math.floor(rng() * m);
    const breather = n % 10 === 0;
    const arch = breather ? "A" : CYCLE[(n - 61) % CYCLE.length];

    // ----- depth-scaled difficulty (§0-legal levers only: more lanterns,
    // tighter geometry, lower target win-rate). Ramps from a band-C feel at the
    // first endless world toward band-D and a gentle expert floor far out, but
    // every board stays solvable and every 10th level is an easy relief valley.
    const worldIdx = Math.floor((n - 1) / 20);       // 3 = first endless world (The Moon)
    const depth = Math.max(0, worldIdx - 3);
    const targetWin = breather ? 0.82 : Math.max(0.32, 0.62 - depth * 0.022);
    const maxWalls = breather ? 0 : Math.min(MAX_BLOCKED, 5 + depth);
    const lanternBase = breather ? Math.min(5, 3 + Math.floor(depth / 6))
                                 : Math.min(6, 4 + Math.floor(depth / 3));

    function genBlocked(a) {
      switch (a) {
        case "A": return [];
        case "B": return [[0,0],[0,7],[7,0],[7,7]];
        case "C": {
          const len = 3 + rInt(2);
          const start = 2 + rInt(8 - 4 - len + 1);
          const horiz = rng() < 0.5;
          const cells = [];
          for (let i = 0; i < len; i++) {
            if (horiz) cells.push([0, start + i], [7, start + i]);
            else cells.push([start + i, 0], [start + i, 7]);
          }
          return cells;
        }
        case "D": {
          const len = 3 + rInt(2);
          const line = 2 + rInt(4);
          const start = 1 + rInt(7 - len);
          const horiz = rng() < 0.5;
          const cells = [];
          for (let i = 0; i < len; i++) cells.push(horiz ? [line, start + i] : [start + i, line]);
          return cells;
        }
        case "E": {
          const k = 2 + rInt(2);
          const cells = [], occ = [];
          let guard = 0;
          while (cells.length < k * 2 && guard++ < 300) {
            const horiz = rng() < 0.5;
            const r = 1 + rInt(6), c = 1 + rInt(6);
            const pts = horiz ? [[r, c], [r, c + 1]] : [[r, c], [r + 1, c]];
            if (pts.some(([pr, pc]) => pr > 6 || pc > 6)) continue;
            const clash = pts.some(([pr, pc]) =>
              occ.some(([qr, qc]) => Math.max(Math.abs(pr - qr), Math.abs(pc - qc)) <= 1));
            if (clash) continue;
            for (const p of pts) { occ.push(p); cells.push(p); }
          }
          return cells.length >= 4 ? cells : null;
        }
        case "F": {
          const len = 5 + rInt(2);
          const off = rInt(8 - len + 1);
          const anti = rng() < 0.5;
          const cells = [];
          for (let i = 0; i < len; i++) { const r = off + i; cells.push([r, anti ? 7 - r : r]); }
          return cells;
        }
      }
    }

    function genLanterns(count, blocked) {
      const bset = new Set(blocked.map(([r, c]) => r + "," + c));
      const cells = [];
      let guard = 0;
      while (cells.length < count && guard++ < 600) {
        const r = rInt(8), c = rInt(8);
        if (bset.has(r + "," + c)) continue;
        if (cells.some(([pr, pc]) => Math.abs(pr - r) + Math.abs(pc - c) < 2)) continue;
        cells.push([r, c]);
      }
      if (cells.length < count) return null;
      if (new Set(cells.map(x => x[0])).size === 1) return null;
      if (new Set(cells.map(x => x[1])).size === 1) return null;
      return cells;
    }

    // pad the archetype with extra scattered stones to tighten deeper boards
    function padWalls(blocked) {
      const want = Math.min(maxWalls, blocked.length + Math.round(depth * 0.7));
      const set = new Set(blocked.map(c => c[0] + "," + c[1]));
      let guard = 0;
      while (blocked.length < want && guard++ < 200) {
        const r = rInt(8), c = rInt(8), k = r + "," + c;
        if (set.has(k)) continue;
        set.add(k); blocked.push([r, c]);
      }
      return blocked;
    }

    // Generate candidates and keep the one whose bot win-rate is CLOSEST to the
    // depth target — that's what makes deep levels actually harder (not just
    // "allowed to be"). Hard gates: solvable from its authored queue, every
    // lantern lightable, and never below a fairness floor.
    // Accept the first board whose win-rate lands in a band around the depth
    // target (fast); otherwise keep the closest. Bounded so a level generates
    // in a few dozen ms even deep in the tail.
    const lo = targetWin - 0.07, hi = targetWin + 0.10;
    let lanternCount = lanternBase;
    let best = null, bestErr = Infinity;
    for (let round = 0; round < 2; round++) {
      for (let attempt = 0; attempt < 18; attempt++) {
        let blocked = genBlocked(arch);
        if (!blocked) continue;
        if (!breather) blocked = padWalls(blocked);
        if (blocked.length > MAX_BLOCKED) blocked = blocked.slice(0, MAX_BLOCKED);
        const lanterns = genLanterns(lanternCount, blocked);
        if (!lanterns) continue;
        const seed = 300000 + rInt(2000000);
        const cand = { id: n, band: "C", blocked, lanterns, seed, archetype: arch };
        if (!E.botPlay(cand, cand.seed).won) continue;          // solvable from its authored queue
        const sim = E.simulateLevel(cand, 10);
        if (sim.lanternLitCounts.some(x => x === 0)) continue;  // every lantern lightable
        if (sim.winRate < 0.28) continue;                       // fairness floor — never near-impossible
        cand.par = sim.bestPieces || lanterns.length;
        if (sim.winRate >= lo && sim.winRate <= hi) { cache[n] = cand; return cand; }
        const err = Math.abs(sim.winRate - targetWin);
        if (err < bestErr) { bestErr = err; best = cand; }
      }
      lanternCount = Math.max(2, lanternCount - 1);             // relief valve if nothing valid
    }
    if (best) { cache[n] = best; return best; }
    // last-resort fallback: trivial open board (should never be reached)
    const fb = { id: n, band: "C", blocked: [], lanterns: [[2,2],[5,5]], seed: 300000 + n, archetype: "A", par: 4 };
    cache[n] = fb;
    return fb;
  }

  root.genLevel = genLevel;
})(typeof globalThis !== "undefined" ? globalThis : this);
