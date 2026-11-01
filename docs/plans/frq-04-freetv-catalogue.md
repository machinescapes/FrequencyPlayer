# Plan: Free-TV/IPTV as the TV source, all countries, country selector (frq-04)

## Context

iptv-org is a huge, unvetted link index. For the UK it gives 131 channels, of which about 78 play. Most of those are niche religious or diaspora streams, and the big channels only appear as dead or DASH restreams. The user prefers [Free-TV/IPTV](https://github.com/Free-TV/IPTV): hand-curated markdown lists, one link per channel, ordered like the real channel line-up (BBC One, BBC Two, ITV 1, …), with logos.

**Decisions made:**
- **Source:** Free-TV replaces iptv-org for TV. iptv-org is removed. `scripts/iptv-config.json` (hide/pin/add) stays, now keyed on Free-TV ids.
- **Countries:** include every country file. Develop and verify against the UK first. Skip the `zz_*` theme lists and any `Radio` sections.
- **Which rows:** every row marked `[>]`; skip `[x]` rows. Geo-blocked rows (Ⓖ) are **kept**, because the user uses a VPN. They get a label, not a penalty.
- **Rows that can't play in a browser:** plain `http://` streams (ITV 1–4 and Channel 5 among them) and YouTube links are kept, in order, and open in a new tab, the same way Bauer radio opens Rayo.
- **Order and logos:** both come from the markdown files. File order is the default display order.
- **Country selector:** a subtle one in the top bar.
- **VPN note:** every page states that a VPN for the selected country should be used.
- **Sync:** a weekly scheduled sync from the repo's lists.
- **Where:** a new git worktree branched from a freshly fetched `origin/main` (frq-03 is merged there, at `c88158f`).

**Facts from the source (24 Oct 2026):**
- 97 list files: 88 countries, plus `*_vod` and `zz_*` lists.
- About 2,050 `[>]` rows across country files:
  - ~1,516 HTTPS HLS
  - 295 `http://`
  - 133 YouTube
  - 25 DASH
  - ~83 other HTTPS: Twitch, Rai `mediapolis` relinkers, forwarders
- 29 `[>]` rows sit inside `<h2>Invalid</h2>` sections and must be skipped.
- UK: 55 `[>]` rows (Freeview 33, Freesat 8, Sky 3, Radio 11); 13 are Ⓖ; all have logos.
- Row format: `| # | Channel Ⓢ Ⓖ | [>](url) | <img src="logo"/> | EPG id |`.
  - Ⓢ means SD, Ⓖ geo-blocked, Ⓨ YouTube.
  - The EPG id column is optional (406 rows lack it).
- `monaco.md` has no `<h1>`.
- Free-TV's own `make_playlist.py` holds the file→ISO country-code map (e.g. `uk`→`GB`).

## Setup

```sh
git fetch origin
git worktree add .claude/worktrees/frq-04-freetv -b feat/frq-04-freetv origin/main
cd .claude/worktrees/frq-04-freetv && pnpm install --frozen-lockfile && pnpm run check
```

Then:
- Add `frq-04-freetv-catalogue` to `feature_list.json`, with this plan copied to `docs/plans/frq-04-freetv-catalogue.md`.
- Follow the AGENTS.md session loop: handoff reset, logging.

## What Gets Built

1. `scripts/freetv-parse.mjs`: a pure parser from Free-TV markdown to catalogue rows.
2. `scripts/sync-tv.mjs`: fetches the lists, parses, applies the config, checks stream health, and writes the catalogue. The `sync:iptv` script entry is replaced by `sync:tv`.
3. Catalogue split per country: `public/tv/index.json` plus `public/tv/<CC>.json`. The app loads only the selected country, not about 800 KB of channels.
4. The client accepts external-only rows and labels them; Ⓖ shows as a "Geo-blocked" tag.
5. A country selector in the top bar, remembered in the URL and localStorage, defaulting to GB.
6. A VPN notice on every view while Watch or All scope is active.
7. A weekly workflow, `tv-sync.yml`, replacing `iptv-sync.yml`.
8. The iptv-org code, tests and docs are removed or rewritten.

## Implementation Steps

### 1. Parser: `scripts/freetv-parse.mjs` (pure, no I/O)

**`COUNTRY_FILES`**
- Map file stem → `{ code, name }`, copied from Free-TV's `make_playlist.py` `COUNTRY_CODES`, plus display names.
- `uk` → `GB` / "United Kingdom". `spain_vod`/`usa_vod` share their country's code and are skipped if they have no `[>]` rows.
- Unknown stems are reported, not guessed.

**`parseList(markdown, { file, code })`**
- Walk the lines and track the current `<h2>` section (stripped of tags).
- Skip sections matching `/^invalid$/i` and `/radio/i`.
- Keep only table rows that contain `[>]`.
- Split cells with Free-TV's own method:
  - `parts = line.split('|')`
  - number = `parts[1]`
  - name = `parts[2]`
  - url = the text between `(` and the last `)` in `parts[3]`
  - logo = the `src="…"` in `parts[4]`
  - epg = `parts[5]`, if present
- Skip and count rows with fewer than five cells.
- Read markers from the name:
  - `Ⓖ` → label `Geo-blocked`
  - `Ⓢ` → `quality: 'SD'`
  - `Ⓨ` → YouTube
- Clean the title by stripping `[Ⓐ-ⓩ]` and extra whitespace.
- `playback`:
  - `'hls'` when `isPlayable()` passes (reuse from `iptv-parse.mjs` before deleting the rest; it checks HTTPS + `.m3u8`).
  - Otherwise `'external'`. That covers http, YouTube, Twitch, DASH and relinkers.
- Row fields:
  - `id`: `<code>:<slug(title)>`, or `<epgId>` if present and unique within the country. Dedupe with a `-2` suffix.
  - `title`, `countryCode`, `section` (the h2 name, e.g. "Freeview"), `order` (running index in the file, which preserves file order), `logoUrl` (HTTPS only, else null), `epgId` (or null), `labels`, `quality`.
  - `streamUrl` for hls rows; `url` for every row (the stream or page to open).
  - `playback`, `category` (= section).

**`buildCountry(rows, config)`**
- Applies `applyConfig` (moved here from `iptv-parse.mjs`), changed to:
  - default `countryCode` from the file, not `'GB'`
  - accept `add` entries with an http/YouTube `url` (they become `playback: 'external'`)
  - sort by `pin`, then `order`, instead of essential then title

### 2. Sync: `scripts/sync-tv.mjs`

**Fetching**
- List `lists/` via `https://api.github.com/repos/Free-TV/IPTV/contents/lists`, using `GITHUB_TOKEN` if set (Actions has one).
- Fetch each file from `raw.githubusercontent.com` at a pinned commit SHA (from the API) so a run is consistent.
- Record `source: { name: 'Free-TV/IPTV', url, commit }`.

**Health check**
- Reuse `verifyStreams` from today's `sync-iptv.mjs`, but only for `playback: 'hls'` rows (about 1,500 at concurrency 16 takes about 2 minutes).
- Ⓖ rows are still checked. When unreachable from the runner, they get `health: 'geo'` instead of `offline`, because the user uses a VPN and the runner is not in that country.
- External rows get `health: 'external'`.

**Output**
- `public/tv/<CC>.json`: version 1, `{ country, name, source, counts, items }`.
- `public/tv/index.json`: `[{ code, name, channels, playable }]` in Free-TV's `flag_order.txt` order, with GB moved first.

**Flags**
- `TV_COUNTRIES=GB` (env) limits the run during development.
- `--check` diffs every output, ignoring `generatedAt`.

**Logging**
- Per-country counts, skipped malformed rows, unmatched config ids, and unknown list files.

**Guide join**
- `scripts/sync-epg.mjs` reads `public/tv/GB.json` (instead of `public/iptv.json`) for the `epgId` → `watch:<id>` guide join.
- Free-TV EPG ids (`BBCOne.uk`, `Channel4.uk`) are the same convention as the Freeview EPG. Keep `EPG_ALIASES` / `epgIdFor` (moved into `freetv-parse.mjs`) and re-check the aliases against the new ids.

### 3. Client

**`app/public/tv-catalogue.js`, `validateTvCatalogue`**
- An item is valid if it has either:
  - `playback: 'hls'` with an HTTPS `.m3u8` `streamUrl`, or
  - `playback: 'external'` with an `http(s)` `url`. An http `url` is allowed only for external rows, never as a `streamUrl`.
- Add validation for the index file.
- Keep the logo and id rules.

**`app/public/media.ts`**
- **`fromWatch`:**
  - For external rows, set `url` = the row url and leave `streamUrl` **undefined**. Today's card and `play()` code (entry.tsx `if (!item.streamUrl) openOfficial(item)`) then opens it in a new tab with the `↗` mark and needs no new playback code.
  - Carry `order` and `section`.
- **`orderChannels`:** listings → pin → `order` (file order) → title.
  - The old essentials tier goes away; `ESSENTIAL_BRANDS` is iptv-org specific.
  - Health no longer reorders. File order is the user's chosen order.
  - Dead links still show the "Offline at last check" note.
- **`healthWarning`:**
  - `external` → "Opens in a new tab"
  - `geo` → nothing extra (the Geo-blocked label covers it)

**`app/public/entry.tsx`**
- **State:** `tvCountry` (from `?country=`, then `loadSaved('frequency.tv.country')`, default `'GB'`). Persist it in `readHash()` / `persistContext()` alongside scope/view.
- **Loading:**
  - Fetch `tv/index.json` once.
  - Fetch `tv/<country>.json` on load and whenever the country changes; abort the previous request through `handle.signal`.
  - Cache in localStorage per country (`frequency.tv.<CC>`), keeping only the last three countries so storage can't grow without limit.
- **Country selector:**
  - In `.topbar-tools`, before search: a compact native `<select>` styled like `.facet-select` but smaller.
  - It shows the flag emoji (built from the ISO code) plus a display code. Options show the full name and channel count.
  - **The UK is always shown as "UK", never "GB"**: the selector label (🇬🇧 UK), the option name ("UK"), the VPN note ("Use a VPN set to the UK") and the URL (`?country=UK`). One helper, `displayCountry(code)` in `media.ts`, maps `GB` → `UK` / "UK" and is used everywhere a country is shown. Data files and `countryCode` stay ISO (`GB`, `tv/GB.json`), because radio rows and the validator already use `GB`. `?country=` accepts both `UK` and `GB`, and is written back as `UK`.
  - It only appears when scope is `watch` or `all`. Radio is UK-only.
- **Existing facet-row country `<select>`:** removed for TV (it would duplicate the new selector). `filterMedia` no longer needs a country filter for watch items, because only one country is loaded.
- **VPN notice:**
  - Reuse the `schedule-status` / `notice` pattern: one `role="note"` line under the view toolbar on Channels and Guide while Watch/All is active.
  - Text: "Many of these channels only stream inside {Country}. Use a VPN set to {Country}." {Country} comes from `displayCountry`, so it reads "the UK", never "GB" or "United Kingdom".
  - Always visible; small and muted.
- **Card labels:** show "Geo-blocked" from `labels` as a small tag next to the existing health note.
- Copy updates: "TV channels unavailable. Check iptv.json." → "… Check tv/<CC>.json."

**`public/sw.js`**
- Replace `iptv.json` in `CORE` with `tv/index.json` and `tv/GB.json`.
- Other countries are cached on fetch (network-first, already the behaviour for same-origin JSON).
- Check that `scripts/build.mjs` copies `public/tv/` (it copies `public/` recursively) and that `server.ts` serves it in dev.

### 4. Remove iptv-org

**Delete**
- `scripts/sync-iptv.mjs`
- `public/iptv.json`
- `test/iptv-parse.test.js`
- `test/iptv-broadcasters.test.js`
- `.github/workflows/iptv-sync.yml`

**Trim `scripts/iptv-parse.mjs`**
- Delete it after moving `isPlayable`, `validateConfig`/`applyConfig` and `EPG_ALIASES`/`epgIdFor` into `freetv-parse.mjs`.
- Drop `parseM3u`, `BROADCASTERS`, `ESSENTIAL_BRANDS`, `toItems` and `buildSnapshot`.

**Reset `scripts/iptv-config.json`**
- Rename it to `scripts/tv-config.json` with entries per country: `{ "GB": { "pin": [], "hide": [], "add": [] } }`.
- Start with an empty `pin`, since file order now gives BBC One, BBC Two, ITV 1 first. The old iptv-org ids no longer exist.

**Docs**
- Replace `docs/iptv.md` with `docs/tv-sources.md`: what Free-TV is, the row rules, playback types, the VPN rationale, the config, and the sync.
- Update `README.md`, `AGENTS.md` (data pipeline, CI and commands) and the `CLAUDE.md` pointers.
- In `feature_list.json`, note that frq-01's essentials tier and frq-02's ids are superseded by frq-04.

### 5. Workflow: `.github/workflows/tv-sync.yml`

- Runs weekly, Monday 04:17 UTC, plus `workflow_dispatch`.
- Steps: pnpm setup, `pnpm sync:tv`, then commit `public/tv/` if it changed and push to `main`. That triggers Pages.
- Pass `GITHUB_TOKEN` to avoid API rate limits.

## Critical Files

| File | Change |
|---|---|
| `scripts/freetv-parse.mjs` | New: parser, country map, config, EPG aliases |
| `scripts/sync-tv.mjs` | New: fetch, parse, check health, write per-country JSON |
| `scripts/tv-config.json` | Replaces `iptv-config.json`, per country |
| `scripts/sync-epg.mjs` | Read `public/tv/GB.json` |
| `public/tv/*.json` | New generated catalogue |
| `app/public/tv-catalogue.js` | Accept external rows; index validation |
| `app/public/media.ts` | `fromWatch` external/order; `orderChannels` file order |
| `app/public/entry.tsx` | Country state + selector, per-country fetch, VPN note, geo tag |
| `public/styles.css` | Compact top-bar select, VPN note, geo tag |
| `public/sw.js`, `scripts/build.mjs`, `server.ts` | Precache/serve `tv/` |
| `.github/workflows/tv-sync.yml` | Replaces `iptv-sync.yml` |
| `test/freetv-parse.test.js`, `test/tv-catalogue.test.js`, `test/media.test.js` | New and updated tests |
| `docs/tv-sources.md`, `README.md`, `AGENTS.md`, `package.json` | Docs; `sync:tv` script |

## Verification

**Unit tests (`test/freetv-parse.test.js`)**, using fixture markdown cut from the real `uk.md` and `zz_news_en.md`:
- Only `[>]` rows are kept.
- Invalid and Radio sections are skipped.
- Ⓖ/Ⓢ/Ⓨ markers are parsed and stripped.
- Logo and EPG are extracted; a missing EPG column is tolerated.
- File order is preserved.
- http and YouTube rows become `external`.
- Malformed rows are counted.
- A file without `<h1>` (monaco) parses.
- Ids are unique.

**Other unit tests**
- `tv-catalogue.test.js`: an external row is valid without `streamUrl`; an http `streamUrl` is still rejected; the committed `tv/GB.json` validates and has BBC One first.
- `media.test.js`: order is pin, then file order; an external item has no `streamUrl`.

**Commands**
- `pnpm run check` is clean.
- `TV_COUNTRIES=GB pnpm sync:tv`:
  - The log shows about 44 GB channels: Freeview, Freesat and Sky, without radio.
  - The first channels are BBC One, BBC Two, ITV 1, STV.
  - The BBC rows are labelled Geo-blocked.
- Full `pnpm sync:tv`: all countries written, `index.json` lists about 88 countries, total size noted. Then `pnpm sync:tv --check` passes.

**Browser (Chrome via Playwright, `pnpm run dev`)**
- `?scope=watch`: the country selector shows 🇬🇧 UK. "GB" appears nowhere in the UI. Cards follow `uk.md` order with logos. The VPN note reads "the UK". `?country=GB` loads the UK and rewrites the URL to `?country=UK`.
- Clicking ITV 1 (http) opens a new tab rather than failing. A BBC card plays if the machine is on a UK connection; otherwise it fails gracefully, and that is recorded rather than called a pass.
- Switching to France: the URL gains `?country=FR`, the cards and VPN note change, and a reload keeps France.
- `?scope=listen`: no country selector, radio unchanged.
- Phone width (390 px): the selector fits in the top bar without overflow.
- No console errors. Save screenshots to `docs/screenshots/frq-04-*.png`.
