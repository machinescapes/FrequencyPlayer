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

1. Fetches the three sources above.
2. Parses each `#EXTINF` entry. Attribute parsing is quote-aware, because
   user-agent strings contain commas (`KHTML, like Gecko`).
3. Drops rows that cannot play in a browser:
   - anything not `https://` — mixed content is blocked on an HTTPS Pages origin
   - anything not ending in `.m3u8` — hls.js only handles HLS
   - anything carrying `http-user-agent` / `http-referrer` — a browser cannot
     set those headers
   - any channel id on iptv-org's blocklist
4. Dedupes by `tvg-id` and keeps the best stream per channel (higher quality
   first, then streams that are not marked `[Not 24/7]`).
5. Groups channels into broadcaster families (`BBC`, `ITV`, `Channel 4`, …) and
   marks a curated "essentials" set — one card per household-name brand.
6. Writes `public/iptv.json`, committed so the Pages build needs no network.

Run it with `npm run sync:iptv`; `npm run sync:iptv -- --check` verifies the
committed file is current. `.github/workflows/iptv-sync.yml` refreshes it weekly.

## Known limitations

- Roughly a fifth of catalogue links are plain `http://` and are excluded.
- Streams die without notice. Expect some fraction of channels to fail on any
  given day; the player offers Retry, Next channel and "Open stream" for those.
- Some streams are geo-blocked; the UI shows a `Geo-blocked` tag from the
  playlist, which is accurate for the broadcaster's intended region rather than
  the viewer's.
- Channel ids use broadcaster ccTLDs (`BBCOne.uk`); `.uk` is normalised to `GB`
  and the rest are treated as ISO 3166-1 codes.
- Broadcaster attribution is heuristic: id prefixes plus iptv-org's `network`
  field. Channels with neither stay unlabelled rather than being guessed at.
