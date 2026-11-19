# TV feeds and channels

Choose **Watch → Add channels** to manage the TV collection. The same link is
available when no channels are enabled. Settings belong to this browser profile;
there is no account or server-side synchronisation.

## Sources and selection

IPTV-org UK's M3U is the enabled default. Free-TV UK is available but switched
off; add other Free-TV countries from **Optional Free-TV feeds**. A country
filter limits browsing, while the feed filter shows all enabled feeds or one.

**Import feed** accepts an HTTPS extended M3U URL or a local M3U/M3U8 file.
Importing shows the entries immediately. Switch whole feeds or individual entries
on/off, search by name/category/status, and enable/disable all matching entries.
Bulk buttons say **filtered** while a search is active. These switches are
separate from favourites.

Refresh downloads a URL again, or asks for a replacement file for an uploaded
feed. It preserves choices for existing entries, removes absent entries and
marks new entries **New**, initially disabled for review. A malformed or
unavailable refresh keeps the previous valid channels.

Matching channel identities and quality variants share one card and stream
selector. Regional and time-shift channels remain separate. Choose a preferred
stream from the card or expanded player; Frequency remembers it. If an inline
stream fails, the player tries each remaining enabled inline URL once. It never
opens an external destination automatically. Channel **Settings → Group with
channel** can explicitly join a group or keep an entry separate.

Only HTTPS HLS streams play inline. HTTP, DASH, YouTube and other unsupported
links remain available as labelled external destinations. Browser/codec support,
CORS and geographic restrictions still determine whether a stream works.

## Verify channels

**Verify channels** (or **Verify filtered channels**) checks up to two entries at
once using isolated muted playback. You can cancel, and the main player keeps
its own media element. A working result requires advancing playback, not merely
a downloadable manifest. Connections time out after 15 seconds.

- **Working:** a playback sample advanced.
- **Failed:** a definitive error such as HTTP 404/410, an invalid HLS playlist or
  a native decode error; the entry is automatically excluded.
- **Inconclusive:** VPN/access restrictions, ambiguous network/CORS errors,
  unsupported browser playback or timeout; the existing choice is retained.
- **External:** open the destination manually to check it.

Results include a reason and check time in channel settings. Re-enable an entry
manually to override an exclusion. A successful recheck clears its automatic
exclusion but never changes a manual disable. Cancellation does not disable
unfinished entries. Checks reflect this browser and network, not global uptime.

## Programme guides

The built-in UK guide includes metadata and listings beyond the currently enabled
channels. Matching uses complete M3U `tvg-id` values and explicit regional aliases.
Unmatched channels can still play.

Expand **Programme guide (XMLTV)** to load an HTTPS XMLTV URL or upload an XML or
XML.GZ file. A declared playlist guide URL is detected on import. Manual channel
mappings take priority, followed by a feed's custom guide and the built-in guide.
Channel settings offer a guide-channel selector. Entries report **Matched**,
**No listings** or **Unmatched**. Grouped alternate streams share a Guide row.

URL-based TV guides refresh every six hours while the app is visible, when it returns to the foreground, and when connectivity returns. Uploaded guides remain unchanged until replaced. Refresh failures preserve cached listings. Remote playlists and guides must allow
browser access; upload a file if their CORS policy prevents access. XMLTV dates
respect their stated offsets; the Guide displays times in the device timezone.

## Persistence and transfer

Feed snapshots, choices, preferred streams and guides are saved in IndexedDB.
**Transfer settings → Export TV settings** includes feed/channel settings,
manual mappings and uploaded guide data. Replaceable remote guide caches are
omitted and fetched again on import. Import replaces TV settings only; radio
additions remain unchanged. Export before changing browser/profile or clearing
site storage. If storage fails, the panel reports that changes may be temporary.

Cached collections and guides remain visible offline; live media still needs a
connection. The default M3U snapshot is shipped with the app and refreshed by
`pnpm sync:tv` and the weekly TV sync workflow. `node scripts/sync-epg.mjs`
generates both the existing radio extract and `public/epg/tv.json`; run it for
local guide testing. Generated guide files remain gitignored.

## Repeating the browser checks

The browser harness uses an external Playwright installation rather than adding
a browser-testing runtime dependency to Frequency. Install Playwright in a
separate temporary directory using pnpm, then run:

```sh
pnpm run dev
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/browser-tv-feeds.mjs
```

It defaults to installed macOS Chrome. Set `CHROME_PATH` for another Chromium
executable. After `pnpm run build`, serve `dist/` with a static server and repeat:

```sh
BROWSER_BASE_URL=http://localhost:44101 BROWSER_EVIDENCE_PREFIX=frq-05-static \
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/browser-tv-feeds.mjs
```

The harness exercises actual browser HLS playback using the attributed local
Big Buck Bunny fixture, alongside playlist/XMLTV/error routes. It captures desktop
and 390px mobile evidence under `docs/screenshots/`. The real default playlist is
also rendered; fixtures do not establish the uptime of every upstream channel.
See [browser evidence](tv-feed-browser-evidence.md) for results and screenshots.
