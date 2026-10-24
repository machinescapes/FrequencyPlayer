# Plan: Channel config file to pin, hide and add TV channels (frq-02)

## Context

The TV catalogue (`public/iptv.json`) is produced entirely by code in `scripts/iptv-parse.mjs` from iptv-org data. The only way to drop a channel, put a channel first, or include a stream iptv-org lacks is to edit parser code. The user asked: "can i control the order and get rid of some". The fix is one small committed config file that `pnpm run sync:iptv` applies. It should be editable without touching code, and the weekly workflow should respect it.

## What Gets Built

- `scripts/iptv-config.json` with three lists: `pin`, `hide`, `add`.
- `applyConfig()` in `scripts/iptv-parse.mjs`, a pure function that's easy to test.
- `sync-iptv.mjs` loads and validates the config and applies it before the health check, so added streams are checked like everything else.
- A `pin` number on each pinned item in `iptv.json`. frq-01 uses it to order the UI.
- Docs and tests.

## Config format

```json
{
  "pin": ["BBCOne.uk", "BBCNews.uk", "ITV1.uk", "Channel4.uk", "Channel5.uk"],
  "hide": ["StarPlus.uk", "DAZNCombat.uk@SD"],
  "add": [
    {
      "id": "Example.uk@HD",
      "title": "Example HD",
      "streamUrl": "https://example.com/live/index.m3u8",
      "category": "General",
      "logoUrl": "https://example.com/logo.png",
      "broadcaster": "Example",
      "epgId": "Example.uk"
    }
  ]
}
```

- **Id matching:** an entry without `@` (e.g. `BBCOne.uk`) matches every feed of that channel (`BBCOne.uk@Scotland`, `@HD`, …). An entry with `@` matches only that exact feed. This is the same base-id rule the blocklist and `EPG_ALIASES` already use.
- **`pin`:** array order is display order. Each matching item gets `pin: <index>`.
- **`hide`:** matching items are removed from the snapshot. `hide` wins over `pin` and `add`.
- **`add`:**
  - Required fields are `id`, `title` and `streamUrl`. The rest are optional.
  - The stream must pass `isPlayable` (HTTPS `.m3u8`). The config is rejected otherwise; the sync doesn't quietly skip it.
  - An added item with the same id as an iptv-org item replaces it. That's how to swap in a better stream for an existing channel.
  - `countryCode` defaults to `GB`. `labels` and `tags` default to `[]`, and `source: "config"` is set so it's clear where the row came from.

The file starts with empty `add` and `hide` lists, and a `pin` list made of the current UK essentials order (BBC One, BBC News, ITV, Channel 4, Channel 5, E4, More4, 5USA, Sky News, GB News). The user then edits it.

## Implementation Steps

1. **`scripts/iptv-parse.mjs`**
   - Add `validateConfig(config)`. It checks the shape, rejects unknown keys and non-string ids, runs `isPlayable` on `add[].streamUrl`, and rejects duplicate `add` ids. It throws errors that name the bad entry.
   - Add `applyConfig(items, config)`, which returns new items:
     1. Remove items that match `hide`.
     2. Merge `add`: replace by id or append, building rows in the same shape `toItems` produces. Reuse `broadcasterFor` when `broadcaster` is missing, and `essentialBrand` for `essential`.
     3. Remove any `add` rows that match `hide`.
     4. Stamp `pin` from the `pin` list.
     5. Sort with pinned items first (by `pin`), then the existing essential-then-title order.
   - `buildSnapshot()` takes an optional `config` and calls `applyConfig` after `toItems`. It adds `counts.pinned`, `counts.hidden` and `counts.added`.
2. **`scripts/sync-iptv.mjs`**
   - Read `scripts/iptv-config.json`. A missing file means an empty config; malformed JSON or an invalid entry stops the sync with an error.
   - Pass the config to `buildSnapshot` before `verifyStreams`, so added streams get `health` too.
   - Log the pinned, hidden and added counts. Warn about any `pin` or `hide` id that matched nothing, since that's probably a typo or a channel iptv-org dropped.
   - `--check` mode includes the config automatically, because it compares the result of the same pipeline.
3. **`app/public/tv-catalogue.js`:** `validateTvCatalogue` keeps `pin` only if it's a non-negative integer, otherwise sets it to `null`. Add `pin` to the `Channel` typedef.
4. **`docs/iptv.md`:** a "Customising the catalogue" section covering the format, the id-matching rule, that `hide` wins, that added streams still need HTTPS HLS and get health-checked, and "run `pnpm sync:iptv` after editing".
5. **`README.md`:** one line under the IPTV/Watch notes pointing to the config.

## Critical Files

| File | Change |
|---|---|
| `scripts/iptv-config.json` | New. Seeded `pin`, empty `hide` and `add` |
| `scripts/iptv-parse.mjs` | `validateConfig`, `applyConfig`; `buildSnapshot` takes `config` |
| `scripts/sync-iptv.mjs` | Load/validate the config, apply it before the health check, log and warn |
| `app/public/tv-catalogue.js` | Pass through and validate `pin` |
| `test/iptv-config.test.js` | New |
| `docs/iptv.md`, `README.md` | Document the config |
| `public/iptv.json` | Regenerated |

## Verification

- **Unit tests in `test/iptv-config.test.js`:**
  - A base id hides every feed; an `@` id hides one.
  - `hide` beats `pin` and `add`.
  - `add` appends new rows and replaces existing ids.
  - A non-HTTPS or non-HLS `add` is rejected with an error naming it.
  - `pin` order is stamped correctly, and pinned items sort first.
  - Unknown keys are rejected.
  - `buildSnapshot` counts are correct.
- `pnpm run check` is clean.
- `pnpm sync:iptv` (network): the log shows the counts and no unmatched-id warnings for the seed list. Then `pnpm sync:iptv --check` passes straight after.
- **Browser:**
  - `pnpm run dev` → `?scope=watch&view=channels`. A hidden channel is absent, including from search (`/`).
  - Add a temporary known-good stream to `add`, re-sync, and confirm it appears and plays. Then revert it.
