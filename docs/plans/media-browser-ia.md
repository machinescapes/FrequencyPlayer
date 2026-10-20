# Unified media browser — Watch | Listen | All

**Status:** revised proposal for approval · **Date:** 2026-10-18

Supersedes the first draft after direction: **UK only for now**, **channels with listings listed first**, **country selector on both TV and radio**, and the scope wording **Watch | Listen | All**.

---

## 1. Context

Frequency ships as two whole apps today:

| | Radio (`/`) | TV (`/tv`) |
| --- | --- | --- |
| Catalogue | 29 items, 25 KB | 8,381 channels, 2.76 MB |
| Nav | `Channels / Guide` | sidebar: Essentials / Everything / Broadcasters / Favourites |
| Guide | EPG timeline, 18 stations | none |
| Country filter | none (broadcaster only) | dropdown, 179 countries |

Two axes are tangled: **source** (TV vs Radio) is expressed as two different applications, and **content shape** (channel vs listing) is only half-built. This plan collapses source into a scope filter and builds one guide.

---

## 2. Decisions taken

| Decision | Choice |
| --- | --- |
| Scope wording | **Watch | Listen | All** |
| Catalogue scope | **UK only** (145 TV channels + 23 radio stations) |
| Ordering | Channels **with listings first**, then the rest |
| Country selector | Present in **both** Watch and Listen |
| Non-UK channels | Deferred; architecture must not block it |
| Default scope | **All** |
| Search | **Not a topbar field** — an icon that opens a command-palette overlay (§7.2) |

---

## 3. The UK-only decision is a large simplification

Measured against the current catalogue:

| | Full | UK only |
| --- | --- | --- |
| TV channels | 8,381 | **145** |
| Payload | 2,762 KB | **50 KB** (1.8%) |
| Broadcasters | 1,410 | 48 named, 44 unnamed |
| Categories | 25 | 24 |

Consequences:

- **No lazy-loading, no chunked rendering, no skeleton state.** 50 KB with the radio's 25 KB is smaller than one logo image — it can be fetched eagerly on first load, exactly like `catalogue.json`.
- The 400-card cap and "Load more" sentinel disappear from the design.
- The `Essentials` view becomes unnecessary: with 145 channels, the whole set fits a normal grid.
- `sync-iptv.mjs` keeps its full-catalogue mode behind an env flag, but the committed snapshot becomes UK-filtered.

---

## 4. Listings-first ordering — and a mapping fix that materially improves it

### 4.1 The alias problem

Only 17 UK channels match the Freeview EPG on iptv's own ids. The majors are present but under **different ids**:

| Channel | iptv id | EPG id | Programmes |
| --- | --- | --- | --- |
| Channel 4 | `Channel4.uk` | `Channel4London.uk` | 236 |
| Channel 5 | `Channel5.uk` | `5.uk` | 303 |
| BBC One Scotland | `BBCOne.uk` | `BBCOneScotHD.uk` | 186 |
| Sky News Weather | `SkyNewsWeather.uk` | `SkyNews.uk` | 281 |
| That's 70s | `Thats70s.uk` | `Thats70s.uk` | 0 (present, empty) |

Adding a small alias table raises UK coverage from **17 → 22 channels** and, critically, puts Channel 4, Channel 5 and BBC One Scotland at the top of the grid rather than below TV Warehouse.

### 4.2 Proposed ordering

```
All UK channels
├── 1. On now            the 22 with listings, sorted by hasGuide, then name
├── 2. Everything else   the remaining 123, sorted by name
```

- `hasGuide` is computed at load by joining against the schedule snapshot.
- Cards with a guide also show a **now/next line** (`Popmaster · 19:00–20:00`), which is the single biggest "this is a real TV app" signal.
- A visible count makes the limitation honest: *"22 of 145 have listings · see all channels"*.

### 4.3 Where the alias table lives

`scripts/iptv-parse.mjs` gains `EPG_ALIASES` (iptv base id → EPG channel id). `sync-epg.mjs` uses it when building the schedule, and stamps a `hasGuide` flag set into `public/iptv.json` at sync time. Both outputs stay static; no runtime joins.

---

## 5. Country selector — one control, both scopes

The radio catalogue is currently all `GB` (23 stations; the 6 podcast items have no country). The TV catalogue is 179 countries, of which we ship 1.

So the selector is **honest but small**: it renders both scopes with `United Kingdom` as the only entry, plus a disabled hint that more are coming. It exists now so that adding a country later is a data change, not a UI change.

```
Country  [ United Kingdom ▾ ]     ← Watch
Country  [ United Kingdom ▾ ]     ← Listen
```

Implementation: one `CountrySelect` used in both scopes, driven by the distinct `countryCode` values actually present in the active catalogue. When only one country exists it still renders (so the control is discoverable and stable) but the label reads `United Kingdom (all)`. Adding `IE` later makes a second option appear automatically.

**Extending later:** `IPTV_COUNTRIES=GB,IE` on `sync-iptv.mjs`; the selector, filters and counts all derive from the data.

---

## 6. Information architecture

```
                        ┌──────────────────────────────────────┐
   GLOBAL  ────────────►│  SCOPE:   Watch  |  Listen  |  All   │  ← URL + persisted
                        └──────────────────────────────────────┘
                                        │
                        ┌───────────────┴───────────────┐
                        ▼                               ▼
        ┌───────────────────────────┐   ┌───────────────────────────┐
   LOCAL│ VIEW: Channels | Guide    │   │ Guide disabled when the   │
        │                           │   │ scope has no listings     │
        └───────────────────────────┘   └───────────────────────────┘
                        │
        ┌───────────────┼────────────────┬────────────────┐
        ▼               ▼                ▼                ▼
   On now (guide)   All channels    Favourites       On demand
   listings first   (grid)          (mixed)          (Listen only)
```

**Scope above view** — scope is a context change ("I want to watch telly"), view is a task within it ("what's on?").

---

## 7. Mockups

### 7.1 Desktop shell

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  ▂▆█ frequency.       ┌────────┬─────────┬───────┐                         ⌕  [◐]│
│                       │ WATCH  │ LISTEN  │  ALL  │                               │
│                       └────────┴─────────┴───────┘                               │
├──────────────────────────────────────────────────────────────────────────────────┤
│  ▦ Channels   ☷ Guide          Country [ United Kingdom ▾ ]     145 channels     │
└──────────────────────────────────────────────────────────────────────────────────┘
```

The topbar holds only identity, scope and the theme toggle. Search is a single
icon at the far right — no field, no placeholder, no reserved width.

### 7.2 Search — command palette, not a field

Search is an **overlay** opened by the icon or `/`, following the pattern used by
Spotify, YouTube Music and Netflix:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  ⌕  ┌──────────────────────────────────────────────────────────────────────┐    │
│     │ channel 4                                                         Esc │    │
│     ├──────────────────────────────────────────────────────────────────────┤    │
│     │ WATCH                                                                 │    │
│     │  ▣ Channel 4            Entertainment · GB · 360p      ● LIVE          │    │
│     │ LISTEN                                                                │    │
│     │  ◉ BBC Radio 4          Talk · GB                     ● LIVE          │    │
│     ├──────────────────────────────────────────────────────────────────────┤    │
│     │ ↑↓ move   ↵ play   Tab scope   Esc close                              │    │
│     └──────────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Why this beats a persistent field here:

- The topbar is **already carrying two controls** (scope, theme). A third
  competing pill made the header dense for a function used rarely.
- Search **spans both catalogues**; a topbar field implies it searches only the
  visible scope. The palette labels results `WATCH` / `LISTEN`, which is honest.
- It can show **richer rows** (logo, category, country, quality, live badge) that
  a 300 px input could never accommodate.
- It is **keyboard-first**, matching the app's existing spatial-navigation and
  gamepad support.
- Closing it restores the previous scroll position and focus.

Behaviour:

- Opens on `⌕` click or `/`; autofocuses; `Esc` closes; `↑↓` move, `↵` plays.
- Empty state shows **recents** (last 5 played) then **favourites**.
- Typing filters via the same `filterMedia(query, …)` used by the grids — one
  search implementation, no divergence.
- With UK-only data the result set is small enough to show live, ungrouped by
  default, with a case-insensitive match on title, broadcaster and category.

### 7.3 Watch → Channels (listings first)

```
┌ page ────────────────────────────────────────────────────────────────────────────┐
│  ON NOW                                22 of 145 have listings                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                │
│  │ Channel 4│ │ Channel 5│ │ BBC One  │ │ Sky News │ │   E4     │                │
│  │ Popmaster│ │ 5 News   │ │ Scotland │ │ Weather  │ │ Hollyoaks│                │
│  │ 19:00–20 │ │ 19:00–19 │ │ 19:00–20 │ │ 19:00–19 │ │ 19:00–19 │                │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘                │
│                                                                                  │
│  ALL CHANNELS                              [ News ][ Music ][ Sport ][ Shop ]    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                │
│  │ Al Hiwar │ │ Anand TV │ │ Akaal    │ │ Blaze    │ │ CNBC UK  │                │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘                │
└──────────────────────────────────────────────────────────────────────────────────┘
```

* **On now** is the listings-first section — the strongest signal that this is a real guide-backed TV app.
* Cards without listings sit in **All channels**, so the grid never has holes.
* Blaze appears in On now (it has listings) — the split is by data, not by fame.

### 7.3 All → Channels

```
┌ page ────────────────────────────────────────────────────────────────────────────┐
│  ON NOW                                                    Country [ UK ▾ ]       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                            │
│  │ 6 Music  │ │ Channel 4│ │  BBC R4  │ │   E4     │  ← mixed, chip on each card│
│  │ ● LISTEN │ │ ● WATCH  │ │ ● LISTEN │ │ ● WATCH  │                            │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘                            │
│                                                                                  │
│  FAVOURITES                                                    ♥ 7              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                                         │
│  │ Radio 1  │ │ ITV3     │ │ NTS 2    │                                         │
│  └──────────┘ └──────────┘ └──────────┘                                         │
│                                                                                  │
│  ALL CHANNELS          [ WATCH 145 ] [ LISTEN 23 ] [ ON DEMAND 6 ]               │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 7.4 Guide

```
┌ page ────────────────────────────────────────────────────────────────────────────┐
│  ☷ GUIDE      ‹ Tue 18 Oct ›   [ Now ]   Country [ UK ▾ ]   ● 40 with listings   │
├──────────────────────────────────────────────────────────────────────────────────┤
│  WATCH  (22)                                                                     │
│  STATIONS         │ 19:00      │ 20:00      │ 21:00      │ 22:00                  │
│  ┌──┬────────────┐├────────────┼────────────┼────────────┼────────────────────────┤
│  │▣ │ Channel 4  ││ Popmaster              │ …                                    │
│  │▣ │ Channel 5  ││ 5 News                 │ …                                    │
│  │▣ │ ITV2       ││ …                      │                                      │
│  ── LISTEN (18) ──────────────────────────────────────────────────────────────────│
│  │◉ │ 6 Music    ││ New Music Fix          │ …                                    │
│  │◉ │ BBC R4     ││ The Archers            │ …                                    │
├──────────────────────────────────────────────────────────────────────────────────┤
│  ⓘ  123 UK channels don't publish a schedule.  Browse all channels →             │
└──────────────────────────────────────────────────────────────────────────────────┘
```

* Rows grouped by source with sticky sub-headers.
* The coverage note is permanent and explains the gap rather than showing it as an error.
* If the active scope has **zero** listings, Guide is disabled and Channels stays selected.

### 7.5 Mobile

```
┌──────────────────────────────┐
│ ▂▆█ frequency.      ⌕    [◐] │
├──────────────────────────────┤
│ [ WATCH │ LISTEN │  ALL ]    │ ← full-width segmented, 44px
├──────────────────────────────┤
│ ▦ Channels   ☷ Guide         │
│ Country [ United Kingdom ▾ ] │
├──────────────────────────────┤
│ ON NOW          22 of 145    │
│ ┌─────────┐ ┌─────────┐      │
│ │Channel 4│ │Channel 5│      │
│ │Popmaster│ │ 5 News  │      │
│ └─────────┘ └─────────┘      │
└──────────────────────────────┘
```

### 7.6 Player dock

```
LISTEN (compact)                         WATCH (theatre)
┌──────────────────────────────────┐     ┌──────────────────────────────────┐
│ [art] BBC Radio 6 Music          │     │ ┌──────────────────────────────┐ │
│       New Music Fix · 19:00–21:00│     │ │         video 16:9           │ │
│                    ▶             │     │ └──────────────────────────────┘ │
└──────────────────────────────────┘     │ Channel 4 · Popmaster   ⛶ PiP ⊟  │
                                         └──────────────────────────────────┘
```

One slot, two forms. Switching source never moves the transport controls.

---

## 8. Data model

One normalised shape from both catalogues (`app/public/media.ts`):

```ts
type Source = 'watch' | 'listen'
type MediaKind = 'live' | 'show' | 'feed' | 'audio'

type MediaItem = {
  id: string              // 'listen:bbc6' | 'watch:Channel4.uk@UK'
  source: Source
  kind: MediaKind
  title: string
  subtitle?: string
  streamUrl?: string
  streamType?: 'mp3' | 'aac' | 'hls'
  logoUrl?: string
  broadcaster?: string
  category: string
  categories: string[]
  countryCode?: string
  quality?: string
  labels: string[]
  hasGuide: boolean       // stamped at sync time
  nowNext?: { title: string; start: number; end: number }
}
```

- Favourites migrate from `frequency.favourites` + `frequency.tv.favourites` into `frequency.favourites.v2` (namespaced ids), old keys retained one release.
- `iptv.json` gains `hasGuide` per item and shrinks to the UK subset (50 KB).
- One filter function replaces both current chains:
  `filterMedia(items, { query, source, country, category, broadcaster, favouritesOnly, listingsOnly })`

---

## 9. Phases

### Phase 1 — One shell, UK catalogue, Watch/Listen/All
- `media.js`; merge `tv-entry.tsx` into `entry.tsx`; `/tv` becomes a redirect to `?scope=watch`.
- Topbar scope switcher (`role="radiogroup"`), content-toolbar view toggle.
- One Channels view: On now → All channels → On-demand (Listen only).
- Shared `CountrySelect` in both scopes.
- UK-filtered `iptv.json`.
- **Exit:** `?scope=watch` shows 145 channels; `?scope=listen` shows 23 + 6; `scope=all` merges without duplicates; no `iptv.json` fetch when scope is listen-only… *(not needed now — it's 50 KB, always fetched).*

### Phase 2 — Listings first + one guide
- `EPG_ALIASES` in `iptv-parse.mjs`; `sync-epg.mjs` maps TV listings into the same `freeview.json`.
- `hasGuide` + now/next stamped into `iptv.json`.
- On-now section; merged timeline with source headers; coverage note; disabled Guide when empty.
- **Exit:** 22 UK channels carry listings and appear first; Channel 4/5 and BBC One Scotland are among them; Guide shows 40 rows in All.

### Phase 3 — Polish
- Dock transition (compact ↔ theatre) without layout jump.
- Remote/keyboard pass over scope → view → grid.
- Sort control; remembered facets per scope.
- Fold `tv.css` into `styles.css` layers.

---

## 10. Risks

| Risk | Mitigation |
| --- | --- |
| Only 22/145 have listings, so "On now" is a thin strip | Count is visible ("22 of 145"); the rest still browse normally |
| Alias table is hand-maintained | Keep it small and test it; unmatched ids simply fall back to no listing |
| UK-only feels sparse | 145 channels is still a full grid; the country selector makes expansion a data change |
| Merge churn with `main` | Phase 1 is one focused branch; later phases additive |

---

## 11. Verification

1. **Unit** — `media.js` normalisation, ordering (hasGuide first), country filter, favourites migration; `EPG_ALIASES` resolution tests. `npm test`.
2. **Data** — `node scripts/sync-epg.mjs` yields 22 mapped UK channels; `npm run sync:iptv -- --check` is clean; `iptv.json` < 60 KB and contains no non-GB items.
3. **Browser** — `?scope=watch` renders 145 with On now first; `?scope=list` renders 23 + On demand; `?scope=all&view=guide` renders 40 rows; Guide disabled in a scope with no listings.
4. **Country selector** — shows `United Kingdom (all)`; with a second country injected locally, both scopes gain the option and counts update.
5. **Keyboard/remote** — scope → view → grid traversal, no focus traps.
6. **Visual** — 1440 / 900 / 390; no overflow at 360.

---

## 12. Open questions

None blocking — scope defaults to **All**, search is a palette overlay, and the
UK catalogue is final for this phase.

Deferred by design, to revisit once the shell is live:
- Whether `Favourites` should be a section or its own view in `All`.
- Whether the palette should list broadcasters as well as channels.
