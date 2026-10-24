# TV sources

Frequency's Watch channels come from [Free-TV/IPTV](https://github.com/Free-TV/IPTV),
a hand-curated list of free-to-air channels around the world. It replaced the
much larger, unvetted iptv-org index in October 2026.

## What Free-TV is

A set of markdown files, one per country (`lists/uk.md`, `lists/france.md`, …),
each a table of channels in that country's channel-number order:

```
| # | Channel | Link | Logo | EPG id |
|  1 | BBC One Ⓖ | [>](https://…/bbc_one…/iptv_hd_abr_v1.m3u8) | <img src="…BBC_One_logo…"/> | BBCOne.uk |
```

Free-TV's own rules: one link per channel, free-to-air only (no paid
channels), no adult, religious or political-party channels. A link marked `[>]`
is believed to work; `[x]` means broken or missing. Markers in the channel name:
`Ⓖ` geo-blocked, `Ⓢ` SD only, `Ⓨ` a YouTube live page.

Free-TV hosts no video. The links point at broadcasters' own CDNs where they
exist (BBC, S4C, STV, France TV, Rai…) and at unofficial restreams where they
don't (ITV 1–4 and Channel 5 are plain `http://` addresses).

## What the sync keeps

`pnpm sync:tv` (`scripts/sync-tv.mjs` + `scripts/freetv-parse.mjs`):

1. Pins the run to Free-TV's latest commit and fetches every `lists/*.md`.
2. Skips theme lists (`zz_news_en`, `zz_movies`, …) and, inside country files,
   `Invalid` and `Radio` sections — Listen already covers UK radio.
3. Keeps every `[>]` row, **in file order**, with its logo and EPG id.
   `*_vod` lists follow their country's main list.
4. Sorts each row into one of two kinds:
   - **Inline** (`playback: "hls"`): an HTTPS `.m3u8` stream. Plays in the app.
   - **External** (`playback: "external"`): `http://` streams, YouTube, Twitch,
     DASH and relinkers. A browser on an HTTPS site cannot play these, so the
     card shows ↗ and opens the link in a new tab instead.
5. Keeps geo-blocked (`Ⓖ`) rows and labels them "Geo-blocked". Viewers are
   expected to use a VPN set to that country; every Watch page says so.
6. Applies `scripts/tv-config.json` (below).
7. Probes each inline stream once and records `health`:
   `ok` (plays), `cors` (reachable but the host refuses browsers), `offline`,
   or `geo` — a geo-blocked stream the sync could not reach. The sync runs
   outside most of these countries, so `geo` means "expected to work over a
   VPN", not "dead". External rows get `health: "external"`. Health never
   changes the order; non-`ok` cards carry a small note instead.
8. Resolves EPG ids against the Freeview guide (UK only), via `EPG_ALIASES`
   where Free-TV and dp247/Freeview-EPG use different ids for the same channel.
9. Writes `public/tv/<CC>.json` per country and `public/tv/index.json` (the UK
   first, then Free-TV's regional order). The app loads one country at a time.

`TV_COUNTRIES=GB pnpm sync:tv` limits a run to some countries while developing
(it leaves `index.json` alone). `pnpm sync:tv --check` verifies the committed
files; because it re-probes live streams, a failure can be upstream drift
rather than a code change. `.github/workflows/tv-sync.yml` runs the sync every
Monday at 04:17 UTC (or on demand with `gh workflow run tv-sync.yml`) and
commits `public/tv/` to `main` when anything changed, which redeploys Pages.

Country codes are ISO 3166-1 in data (`GB`, `tv/GB.json`). Menus and URLs show
the UK as **UK** (`?country=UK`); `?country=GB` is accepted and rewritten.

## Customising the catalogue

`scripts/tv-config.json` is keyed by country code. Edit it, run
`pnpm sync:tv`, and commit both.

```json
{
  "GB": {
    "pin": ["GB:bbc-news", "GB:bbc-one"],
    "hide": ["GB:tjc"],
    "add": [
      { "id": "GB:my-channel", "title": "My Channel", "url": "https://example.com/live/index.m3u8", "category": "Freeview" }
    ]
  }
}
```

- **Ids** are the `id` values in `public/tv/<CC>.json`: `<CC>:<slug of the
  title>`, e.g. `GB:bbc-one`, `GB:itv-1`.
- **`pin`**: these lead, in list order; everything else keeps Free-TV order.
- **`hide`**: removes channels. Hide always wins over `pin` and `add`.
- **`add`**: channels Free-TV lacks, or a better link for one it has (the same
  id replaces it and keeps its position). Needs `id`, `title` and an `http(s)`
  `url`; HTTPS `.m3u8` plays inline, anything else opens in a new tab.
  Optional: `category`, `logoUrl`, `quality`, `labels`, `epgId`.
- A malformed config stops the sync. Ids that match nothing are printed as
  warnings — usually a typo, or a channel Free-TV renamed.

## Channel order

Within each row of the Watch grid (favourites have their own row, and channels
with listings sit in "On now"), `orderChannels()` in `app/public/media.ts`
orders by: config `pin` → Free-TV list order → title.

## Known limitations

- ITV 1–4, Channel 4 family and Channel 5 only exist in Free-TV as `http://`
  restreams. They open in a new tab, where some browsers will still refuse
  them; none of the broadcasters publish an open stream.
- Geo-blocked streams need a VPN in that country. The BBC's streams are
  UK-only.
- Free-TV skips some country files' rows that are malformed (a handful in
  Bosnia, Hungary, Japan and Serbia); the sync logs how many.
- Some countries list few channels: Ireland's RTÉ and Virgin Media are in
  Free-TV's own "Invalid" section, so only TG4 and the Oireachtas channel remain.
