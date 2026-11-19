# FRQ-05 browser evidence

Verified on 18 November 2026 using installed Google Chrome through Playwright,
at 1440×1000 desktop and 390×844 touch/mobile viewports. Both the development
server and the built static site were exercised. Real muted HLS playback used
the attributed local Big Buck Bunny fixture; network/error/XMLTV routes made
failure cases reproducible. No application page errors were observed.

## Commands and results

- `./init.sh`: baseline typecheck/lint and 50/50 tests passed.
- `pnpm run check`: expanded suite, 70/70 tests passed.
- `pnpm run build`: passed, including all lazy JS chunks in the offline manifest.
- `node scripts/sync-epg.mjs`: 287 broad-guide channels / 48,965 programmes;
  existing radio/TV extract 9,122 programmes.
- `PLAYWRIGHT_MODULE=/tmp/frq05-browser/node_modules/playwright/index.mjs node scripts/browser-tv-feeds.mjs`:
  development desktop/mobile suite passed.
- `BROWSER_BASE_URL=http://localhost:44101 BROWSER_EVIDENCE_PREFIX=frq-05-static PLAYWRIGHT_MODULE=/tmp/frq05-browser/node_modules/playwright/index.mjs node scripts/browser-tv-feeds.mjs`:
  static production desktop/mobile suite passed.
- `pnpm sync:tv --check`: failed on optional Free-TV catalogue/live health drift
  from committed snapshots. Optional country JSON files were left unchanged.
  The new default M3U snapshot was separately compared to its live source after
  normalising line endings and matched (308 entries, 297 grouped channels).

Expected 404/403 fixture responses intentionally exercise failure/access states;
these are not application exceptions. The suite also observes no unsolicited
external tabs during verification or fallback. A tab opens only on an explicit
external-channel click.

Quality CI also passed on both the [branch push](https://github.com/machinescapes/FrequencyPlayer/actions/runs/44466068797) and [PR run](https://github.com/machinescapes/FrequencyPlayer/actions/runs/44466079881). [PR #14](https://github.com/machinescapes/FrequencyPlayer/pull/14) embeds seven representative screenshots and links this full report.

## Screenshot coverage

Each scenario has development and production evidence. The table links the
production captures; corresponding files use the `frq-05-dev-` prefix.

| Scenario | Observed result / production screenshot |
| --- | --- |
| Default feed | [IPTV-org UK renders](screenshots/frq-05-static-01-default-watch.png); no fixture replaces the default playlist. |
| Add channels | [Manager opens directly to the channel list](screenshots/frq-05-static-02-default-manager.png), with disabled Free-TV UK available. |
| Empty collection | [Add channels remains reachable](screenshots/frq-05-static-03-empty-add-channels.png) with TV feeds switched off. |
| URL import | [Imported entries appear immediately](screenshots/frq-05-static-04-imported-channels.png); malformed import leaves the collection unchanged. |
| Verification | [Actual muted playback, failed/inconclusive/external results](screenshots/frq-05-static-05-verification-results.png); 404 excluded, 403 retained. Manual re-enable and filtered bulk switches pass. |
| EPG mapping | [Manual mapping selector](screenshots/frq-05-static-06-manual-epg-mapping.png); explicit group/ungroup reduces/restores Guide rows correctly. |
| Feed refresh | [New discovery starts disabled](screenshots/frq-05-static-07-refresh-new-disabled.png); existing choices persist. |
| Failed refresh | [Previous entries retained](screenshots/frq-05-static-08-refresh-error-retains-channels.png). |
| Guide | [Listings join grouped channel rows](screenshots/frq-05-static-09-grouped-guide.png); stream variants do not duplicate the channel. |
| Playback | [Failed preferred URL falls back to a playing HLS stream](screenshots/frq-05-static-10-fallback-playing.png); explicit preference survives export/import and reload. Main playback advances during a separate probe. |
| Uploaded sources | [M3U and gzipped XMLTV upload](screenshots/frq-05-static-11-uploaded-gzip-guide.png), including a distinct Scotland variant and a cross-feed alternate stream. |
| Cancellation | [Incomplete verification leaves channels enabled](screenshots/frq-05-static-12-cancel-verification.png). |
| Mixed scope | [All combines radio and TV](screenshots/frq-05-static-13-all-scope.png); Listen and keyboard search also pass. |
| Offline | [Cached collection reloads offline](screenshots/frq-05-static-14-offline-reload.png); settings export/import and ordinary reload also pass. |
| Mobile management | [Channel controls at 390px](screenshots/frq-05-static-15-mobile-channels.png); no horizontal overflow. |
| Mobile playback | [Playing sticky player at 390px](screenshots/frq-05-static-16-mobile-player.png); Escape closes management. |
| Optional sources | [Free-TV switch and feed filter](screenshots/frq-05-static-17-optional-free-tv.png); disabling the filtered feed resets the filter. |
| Failed XMLTV refresh | [Previously loaded listings retained](screenshots/frq-05-static-18-guide-error-retains-listings.png). |

## Limits

The real default playlist was parsed/rendered; every upstream stream was not
probed, and fixture results do not establish global uptime. Geographic and CORS
restrictions depend on the user's network. Real iOS Safari, hardware gamepads
and TV devices were not tested in this session. Instructions to repeat the suite
are in [TV feeds and channels](tv-feeds.md).


## PR review regressions

The two available review threads were posted by Codex, not Claude; both were
valid, fixed in `cdfe497`, replied to with evidence and resolved ([favourites reply](https://github.com/machinescapes/FrequencyPlayer/pull/14#discussion_r4625194988), [guide reply](https://github.com/machinescapes/FrequencyPlayer/pull/14#discussion_r4625195215)). Quality CI passed on both review-fix runs. The expanded check/build passes **73/73** tests.
Focused real-Chrome checks pass against development and built static output,
with no page errors and twelve additional screenshots (six per serving mode).

- **Migrated favourites:** consume unambiguous legacy mappings, preserve dormant
  unmatched/ambiguous IDs, and remember explicit removals even if metadata arrives
  later. Browser checks remove a migrated favourite, change country, reload and
  toggle its legacy feed; the favourite stays removed.
  [Removal remains removed](screenshots/frq-05-review-static-01-removal-persists.png).
- **Long-running TV guides:** refresh the built-in guide and remote custom guides
  on reconnect, visible-tab events and the six-hour timer; overlapping events
  share in-flight requests. Guide refresh also updates media metadata.
  [Reconnect refresh](screenshots/frq-05-review-static-02-online-refresh.png),
  [visible-tab refresh](screenshots/frq-05-review-static-03-visible-refresh.png),
  [six-hour refresh](screenshots/frq-05-review-static-05-six-hour-refresh.png).
- Guide failures keep valid cached data; uploaded guides are not fetched as remote
  sources. [Retained listings after failure](screenshots/frq-05-review-static-04-failure-retains-guide.png),
  [uploaded guide retained](screenshots/frq-05-review-static-06-upload-not-refetched.png).

Repeat with `PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node
scripts/browser-tv-review.mjs`. For static output add
`BROWSER_BASE_URL=http://localhost:44101 BROWSER_EVIDENCE_PREFIX=frq-05-review-static`.
The harness uses Playwright's browser clock to exercise the actual six-hour
interval without a six-hour wait. The production screenshot links above also have
corresponding `frq-05-review-dev-` captures.
