# Plan: Control TV channel order and essentials (frq-01)

## Context

The user flagged: "Order: edit orderChannels() for runtime order, or ESSENTIAL_BRANDS for what counts as essential".

Today the two levers don't line up:

- **`ESSENTIAL_BRANDS`** (`scripts/iptv-parse.mjs`) marks one stream per household-name brand as `essential` and sorts essentials first *inside `iptv.json`*. But `fromWatch()` in `app/public/media.ts` doesn't carry `essential` into `MediaItem`, and the app always re-sorts. So **the essentials flag has no visible effect in the app.**
- **`orderChannels()`** (`app/public/media.ts`) sorts by `hasGuide`, then favourites, then stream health, then title. `entry.tsx` already splits channels into an "On now" row (with a guide) and the main grid (without), and removes favourites first. So in practice the order is just health, then alphabetical.

The goal is one clear ordering, controlled by data rather than code. frq-02's config `pin` list sets the exact order. Essentials are the next tier. Health keeps dead links at the bottom.

**Depends on:** frq-02, which provides `pin` in `iptv.json`. It can be built first or on the same branch. The runtime code treats a missing `pin` as unpinned, so it's also safe to ship on its own.

## What Gets Built

- `MediaItem` gains `pin?: number` and `essential?: boolean`, filled in by `fromWatch()`.
- `orderChannels()` becomes one documented comparator over explicit tiers.
- Favourites keep their own row (unchanged).
- A short doc section on "how channel order is decided" and which file to edit for each tier.

## Ordering rule

Within each row that `entry.tsx` renders ("On now" and the main grid), in this order:

1. **Pinned**, by `pin` ascending. These are channels listed in `scripts/iptv-config.json` → `pin`.
2. **Essential**, i.e. the best stream per brand in `ESSENTIAL_BRANDS`.
3. **Health**: `ok`, then `unknown`, then `cors`, then `offline`. Dead links stay at the bottom, even when pinned or essential, *within their tier*.
4. **Title**, alphabetical (`en`).

`hasGuide` stays as the very first key so `orderChannels` still works correctly for callers that don't split rows. The favourites key is dropped from the comparator, because `entry.tsx` already gives favourites their own row and the `favourites` parameter is otherwise unused there. Radio items have no `pin` or `essential`, so for them the order is unchanged (guide, then title).

**Pinned-but-offline:** a pinned channel stays in its pinned position even if it's `offline`. Pinning is an explicit user choice, and the card already shows "Offline at last check". Health only orders the unpinned tiers.

## Implementation Steps

1. **`app/public/media.ts`**
   - Add `pin?: number` and `essential?: boolean` to `MediaItem`.
   - In `fromWatch()`: `pin: Number.isInteger(item.pin) ? item.pin : undefined` and `essential: item.essential === true`.
   - Rewrite `orderChannels(items)` to the tiers above as small named key functions. Drop the `favourites` parameter, and update the two call sites in `entry.tsx` (they already pass none).
   - Replace the doc comment with the rule as stated above.
2. **`scripts/iptv-parse.mjs`**
   - Keep `ESSENTIAL_BRANDS`, and add a comment above it saying it controls tier 2 of the app's order and pointing to `scripts/iptv-config.json` for exact positions.
3. **`entry.tsx`:** no logic change apart from the call signature. Update the "Listings first…" comment to match.
4. **`docs/iptv.md`:** a "Channel order" section with the four tiers and the file that controls each: config `pin` → `ESSENTIAL_BRANDS` → sync health → title.
5. **`AGENTS.md`:** update the one-line `orderChannels` description in the Client section.

## Critical Files

| File | Change |
|---|---|
| `app/public/media.ts` | `MediaItem.pin` / `essential`, `fromWatch`, new `orderChannels` |
| `app/public/entry.tsx` | Call-site signature and comment |
| `scripts/iptv-parse.mjs` | Comments only |
| `test/media.test.js` | Ordering tests |
| `docs/iptv.md`, `AGENTS.md` | Document the order |

## Verification

- **Unit tests in `test/media.test.js`:**
  - Pinned items come before essentials, which come before the rest.
  - `pin` ascending is honoured.
  - A pinned offline item keeps its position.
  - Among unpinned items, `ok` comes before `cors`, which comes before `offline`.
  - Title is the tie-break.
  - Radio order is unchanged.
  - `fromWatch` maps `pin` and `essential`, and ignores a non-integer `pin`.
- `pnpm run check` is clean.
- **Browser (`pnpm run dev`):**
  - `?scope=watch&view=channels`: the first cards in each row follow the config `pin` list. Essentials come next. "Offline at last check" cards sit at the end of the unpinned section. Take a screenshot.
  - `?scope=listen`: radio order is unchanged from `main`. Do a side-by-side check.
  - `?scope=all`: no duplicates, and the favourites row is unaffected.
