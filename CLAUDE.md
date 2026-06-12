# Lanthorn — project rules for Claude sessions

Web-first block puzzle (drag pieces, clear lines, light lanterns). Spec = `lanthorn-prd/00-PRD.md`
(§0 complexity law is binding: 1 verb, 0 pre-learned rules, no timers/counters; tutorial = one
sentence). `README.md` has run/test/deploy commands. Decisions and gotchas live in the Claude
memory dir for this project — trust those over assumptions.

## Non-negotiables

- **After every code change run `scripts/dev/test.sh`** (~5s: syntax, 117 engine/data invariants,
  60-level bot validation). After UI changes, also pixel-verify in the browser preview
  (`.claude/launch.json` → `lanthorn-web`, port 4173, `?debug=1` exposes `LD.*` helpers).
- **`web/js/engine.js` must stay behavior-identical to `lanthorn-prd/greybox/engine.js`**
  (same RNG draw order, same bot arithmetic). engine-tests cross-check both engines and the PRD
  appendix win rates. Never "improve" engine logic casually.
- **Never hand-edit `web/js/levels.js`** — regenerate: `node scripts/dev/gen-levels.cjs`
  (deterministic, master seed 20260611). Same for sounds: `python3 scripts/dev/gen_sounds.py`
  → `web/sounds/` (+ afconvert aac for bgm).
- **Position-band law** (tuning.json): levels 1-10 band A (bot ≥85%), 11-30 B (≥70%),
  31-60 C (≥55%); every 10th level = archetype-A breather; lanterns never all in one line.
- After self-test passes, **deploy to the iPhone without asking**: `scripts/dev/deploy_ios.sh`
  (test → cap sync → xcodebuild → devicectl install/launch; retries transient install failures).

## Architecture (one codebase, decided June 2026)

- `web/` = the entire game, vanilla JS/DOM/canvas, no build step. Ships three ways: browser,
  CrazyGames (launch channel; SDK wrapper in `web/js/sdk.js` no-ops elsewhere), and the
  **Capacitor** iOS app in `ios/` (SPM mode, no CocoaPods). Unity/Godot ports were considered
  and rejected — do not reintroduce. Godot is the fallback only if a webview perf wall appears.
- Native bits live in `ios/App/App/NativeFX.swift` (Capacitor plugin: AVAudioEngine sample
  player + BGM loop, Taptic haptics, Firebase Analytics `track`). New Swift files must be
  **hand-registered in project.pbxproj** (template has no synchronized groups). Firebase comes
  via SPM remote package in App.xcodeproj — never via `CapApp-SPM/Package.swift` (cap sync
  regenerates that file).
- Analytics: one API (`Track.ev`) → native Firebase SDK in the app / gtag on web. Firebase
  project `lanthorn-535f2` (console account jayfunlin@gmail.com). Web measurement ID may still
  be pending in `web/js/analytics.js` — check `GA_MEASUREMENT_ID`.
- Apple signing: team `Y3T546NP6T` (tbcql1986@gmail.com), bundle `com.jfun.lanthorn`,
  test device UUID in `scripts/dev/deploy_ios.sh`.

## Design system (locked through device playtests — don't regress)

Three screens only (title / game / sky), no level browser, no tab bar, linear progression
("Level N" button = odometer). End cards are textless (LEVEL pill + lantern hero + one wide
button + ✕→title). No near-win assist — any dead-end shows the terse Retry card after the
"No space left" sweep. One gear menu (home + Sound/BGM/Vibration toggles) on title and in-game.
All icons are inline SVG or CSS — no emoji/font glyphs except the music notes.
