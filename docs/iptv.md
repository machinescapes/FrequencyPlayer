# IPTV channels

Frequency TV plays public IPTV streams catalogued by [iptv-org](https://iptv-org.github.io/).
This note records where the data comes from and what the sync script does to it,
in the same spirit as [sources.md](sources.md).

## What iptv-org is

A **link index**, not a video host. The project collects stream URLs that
broadcasters have published publicly and publishes them as M3U playlists plus
JSON metadata. No media is stored in their repositories. Their README describes
the playlists as links "intentionally made publicly by the copyright holders"
and routes takedown requests to the destination host rather than to GitHub.
The repositories are released under the Unlicense / CC0.

## Sources used

| Source | URL | Notes |
| --- | --- | --- |
| Master playlist | `https://iptv-org.github.io/iptv/index.m3u` | ~11.4k entries, the full index |
| Channel metadata | `https://iptv-org.github.io/api/channels.json` | network name, country |
| Blocklist | `https://iptv-org.github.io/api/blocklist.json` | DMCA and NSFW removals |

All three are static files with `Access-Control-Allow-Origin: *` and no API key
or rate limit. `guides.json` (EPG) is deliberately unused for now.

## What `scripts/sync-iptv.mjs` does

1. Fetches the three sources above, plus the channel ids from the Freeview EPG
   feed (`dp247/Freeview-EPG`). If the guide feed can't be fetched, the
   catalogue is still written, just without guide coverage.
2. Parses each `#EXTINF` entry. Attribute parsing is quote-aware, because
   user-agent strings contain commas (`KHTML, like Gecko`).
3. Drops rows that cannot play in a browser:
   - anything not `https://` — mixed content is blocked on an HTTPS Pages origin
   - anything not ending in `.m3u8` — hls.js only handles HLS (DASH `.mpd`
     streams are excluded, which is why BBC Two/Three/Four are absent)
   - anything carrying `http-user-agent` / `http-referrer` — a browser cannot
     set those headers
   - any channel id on iptv-org's blocklist
4. Keeps only channels whose country is in `IPTV_COUNTRIES` (default `GB`;
   comma-separated, e.g. `IPTV_COUNTRIES=GB,IE`).
5. Dedupes by `tvg-id` and keeps the best stream per channel (higher quality
   first, then streams that are not marked `[Not 24/7]`).
6. Groups channels into broadcaster families (`BBC`, `ITV`, `Channel 4`, …) and
   marks a curated "essentials" set (`ESSENTIAL_BRANDS`) — one card per
   household-name brand. Essentials sort first in the snapshot.
7. Resolves each channel's guide id (`epgId`), including the known id mismatches
   in `EPG_ALIASES`.
8. Probes every stream once (16 at a time, 8 s timeout) and stamps `health`:
   `ok` (200, HLS, `Access-Control-Allow-Origin: *`), `cors` (plays upstream but
   the browser will refuse it) or `offline`. The app sorts by this and labels
   non-`ok` channels; it does not hide them.
9. Applies `scripts/iptv-config.json` (see below) before the probe, so added
   streams are health-checked too.
10. Writes `public/iptv.json`, committed so the Pages build needs no network.

Run it with `pnpm run sync:iptv`; `pnpm sync:iptv --check` verifies the
committed file is current. `.github/workflows/iptv-sync.yml` refreshes it weekly
(Monday 04:17 UTC, or on demand with `gh workflow run iptv-sync.yml`) and
commits to `main` only when the file changed; that push redeploys Pages.

The health probe in that workflow runs on a GitHub-hosted runner outside the
UK, so UK geo-blocked streams are always recorded as `offline` there even if
they play for UK viewers. A local `pnpm run sync:iptv` from the UK gives a truer
picture for those channels.

## Customising the catalogue

`scripts/iptv-config.json` is the hand-edited layer on top of iptv-org. Edit it,
then run `pnpm sync:iptv` and commit both files.

```json
{
  "pin": ["BBCOne.uk", "BBCNews.uk", "Channel4.uk"],
  "hide": ["StarPlus.uk", "DAZNCombat.uk@SD"],
  "add": [
    { "id": "Example.uk@HD", "title": "Example HD", "streamUrl": "https://example.com/live/index.m3u8", "category": "General" }
  ]
}
```

- **Ids**: an id without `@` (`BBCOne.uk`) matches every feed of that channel;
  with `@` (`BBCOne.uk@Scotland`) it matches one feed. Ids are the `id` values in
  `public/iptv.json`.
- **`pin`**: list order is display order. Each matching channel gets a `pin`
  position in `iptv.json`.
- **`hide`**: removes channels. Hide always wins over `pin` and `add`.
- **`add`**: channels iptv-org lacks, or a better stream for one it has (same id
  replaces). Needs `id`, `title` and an HTTPS `.m3u8` `streamUrl`; optional
  `category`, `tags`, `logoUrl`, `broadcaster`, `countryCode` (default `GB`),
  `quality`, `labels`, `epgId`. Added rows carry `"source": "config"`.
- A malformed config stops the sync. Ids that match nothing are printed as
  warnings — usually a typo, or a channel iptv-org dropped.

## Known limitations

- Roughly a fifth of catalogue links are plain `http://` and are excluded.
- Streams die without notice; the snapshot of 19 October 2026 had 73 of 145
  channels `ok`, 31 `cors` and 41 `offline`. Expect some fraction of channels to fail on any
  given day; the player offers Retry, Next channel and "Open stream" for those.
- Some streams are geo-blocked; the UI shows a `Geo-blocked` tag from the
  playlist, which is accurate for the broadcaster's intended region rather than
  the viewer's.
- Channel ids use broadcaster ccTLDs (`BBCOne.uk`); `.uk` is normalised to `GB`
  and the rest are treated as ISO 3166-1 codes.
- Broadcaster attribution is heuristic: id prefixes plus iptv-org's `network`
  field. Channels with neither stay unlabelled rather than being guessed at.
