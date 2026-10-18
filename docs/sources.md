# Content sources and integration notes

Checked 18 October 2026. Frequency is a static browser app. It does not proxy audio, import broadcaster credentials, scrape schedules, or cache streamed media.

## What is verified

The built-in collection contains 23 live stations and the six original show/discovery entries. The requested station list totalled 22; LBC News supplies the additional main Global station. Existing item IDs are preserved.

Seventeen anonymous direct streams passed endpoint checks and actual playback checks in installed desktop Google Chrome and Playwright WebKit 26.6 on the development machine. Tests observed the `playing` event and media progression. Chrome exercised HLS.js explicitly as well as native HLS when reported; WebKit used native HLS. Audio was muted in automated tests: these checks establish browser decoding/playback, not listening quality, long-term reliability or UK geographic availability. No UK network, physical iPad/PWA, actual Safari app, background playback or physical controller verification has been performed. An actual Safari WebDriver session was attempted, but Safari rejected it because “Allow remote automation” is disabled; that setting was left unchanged.

Six Bauer stations intentionally use their official Rayo pages. Their inclusion does not claim independently playable streams. No stream uses a copied authentication token or a fabricated logged-in query parameter.

## BBC Radio 1–6

Live endpoints were discovered through the maintained [BBC Radio Streams community playlist](https://gist.github.com/bpsib/67089b959e4fa898af69fea59ad74bc3). This is discovery evidence, not BBC documentation or a stability commitment. Each configured HTTPS 96 kbps worldwide playlist and an audio segment returned HTTP 200 without credentials; the playlists allowed CORS `*`. All six played in Chrome and WebKit.

The configured pattern is:

```text
https://as-hls-ww-live.akamaized.net/pool_{pool}/live/ww/{service}/{service}.isml/{service}-audio%3d96000.norewind.m3u8
```

| Station | Service | Pool |
| --- | --- | --- |
| Radio 1 | bbc_radio_one | 01505109 |
| Radio 2 | bbc_radio_two | 74208725 |
| Radio 3 | bbc_radio_three | 23461179 |
| Radio 4 | bbc_radio_fourfm | 55057080 |
| Radio 5 Live | bbc_radio_five_live | 89021708 |
| Radio 6 Music | bbc_6music | 81827798 |

The previously investigated `as-hls-ww.live.cf.md.bbci.co.uk/pool_904/...` endpoint returned HTTP 410 and is excluded. Do not infer new pools or quality variants by changing URL strings. Recheck publisher/discovery sources and actual playback when a stream changes.

Worldwide streams may exclude sports or other restricted programmes, especially on 5 Live. UK-first means the catalogue selection, not verified UK sports rights or automatic geographic routing. See the BBC's [international access guidance](https://help.bbc.com/hc/en-us/articles/42652680528659-Update-on-access-to-BBC-Sounds-outside-the-UK).

Official live, schedule and programme pages remain fallbacks. Station Shows links use the official schedule for programme discovery; the existing named programme cards link to their individual destinations. Proposed station `/programmes/a-z` routes returned 404 and were excluded. The Craig Charles destination remains https://www.bbc.co.uk/programmes/m000h9wt.

### BBC sign-in and catch-up

Live stream access does not establish catch-up access. BBC show pages may require sign-in, UK access or content-specific permissions. Frequency opens them as full pages in a separate tab with `noopener`, after releasing current audio. The official page can use its own browser-profile session; installed PWA and Safari session behaviour must be checked on the target device. Frequency cannot read BBC cookies or make an independent audio request inherit page authentication. See [browser origin restrictions](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy).

## Global / Global Player

The primary source is [Global's RadioDNS service information](https://epg.musicradio.com/radiodns/spi/3.1/SI.xml), which publishes station names, logos, HTTPS MP3/AAC bearers and bitrate metadata. The catalogue uses UK national MP3 bearers rather than silently substituting London variants.

All endpoints below use `https://media-ssl.musicradio.com/` and returned audio and played in Chrome and WebKit:

| Station | MP3 path |
| --- | --- |
| Radio X | RadioXUKMP3 |
| Capital | CapitalUKMP3 |
| Capital XTRA | CapitalXTRANationalMP3 |
| Heart | HeartUKMP3 |
| Classic FM | ClassicFMMP3 |
| Smooth | SmoothUKMP3 |
| LBC | LBCUKMP3 |
| LBC News | LBCNewsUKMP3 |
| Gold Radio | GoldMP3 |

Use GET for verification; the previously checked Radio X server rejected HEAD with 405. Opening an endless live stream successfully should be checked with a bounded read, not by downloading it.

Official player and catch-up directories use Global Player. Programme schedules link to broadcaster sites. Heart, Capital and Smooth may ask the listener to choose a region; LBC News has its own schedule and no separate catch-up/show-directory action. A page returning HTTP 200 does not guarantee episodes are playable or available outside the UK. Catch-up remains in the official player; no public authenticated catch-up API is integrated.

## Bauer / Rayo

Greatest Hits Radio, Absolute Radio, KISS, Magic Radio, Planet Rock and Jazz FM use their official `hellorayo.co.uk` station, schedule and show destinations. See [Rayo's official listening guidance](https://www.hellorayo.co.uk/greatest-hits/station/on-air/how-to-listen-rayo).

Station-specific logos are from [Bauer's RadioDNS service information](https://listenapi.planetradio.co.uk/radiodns/spi/3.1/SI.xml). This feed responded successfully and did not publish HTTPS audio bearers for the six selected stations. Earlier `live-bauer-al.sharp-stream.com` guesses returned 404 or 500. These are deliberately absent from the catalogue. Rayo pages can reject automated requests (403); verify their interactive availability from the intended UK browser. A directory's copied token-like or logged-in stream parameters are not a supported integration.

## NTS

[NTS](https://www.nts.live/) provides two channels and official schedule/archive browsing. Bounded anonymous GETs returned `audio/mpeg`, and both played in Chrome and WebKit:

- NTS 1: https://stream-relay-geo.ntslive.net/stream
- NTS 2: https://stream-relay-geo.ntslive.net/stream2

Schedule: https://www.nts.live/schedule. Show discovery: https://www.nts.live/explore. The shared NTS artwork comes from the official site's social-image metadata (`/css/images/nts-socials-img.png`). No archive stream extraction is implemented.

## Station logos and provenance

BBC, Global and Bauer artwork is referenced from their broadcaster-hosted metadata feeds; every selected live-station image returned HTTP 200. Global's feed supplied HTTP artwork links: their HTTPS equivalents were checked successfully before inclusion. Logos are displayed unmodified with preserved proportions and fall back to text marks if unavailable. BBC and Global logos are also reused on their corresponding show/discovery cards; these are station identities, not programme artwork.

[RadioDNS Project Logo](https://radiodns.org/campaigns/project-logo/technical-details/) explains service information and station-logo discovery. Metadata publication does not transfer ownership of artwork or imply broadcaster endorsement. Refer to the broadcaster's feed terms, including the [BBC metadata terms](https://radiospi.api.bbci.co.uk/terms.txt); those terms require reviewing the BBC metadata at least monthly. Maintain these source references and review configured artwork/metadata accordingly. Frequency fetches images directly, without bundling downloaded logos or exposing broadcaster credentials. No automatic metadata synchronization is implemented.

The config accepts `logoUrl` as HTTPS or an app-relative image path, `color`, `provider`, `countryCode`, `scheduleUrl`, `showsUrl`, and `streamType` (`mp3`, `aac`, `hls`). Relative images resolve under the application's base path. Custom sources are not restricted to the UK. Catalogue version 1, original IDs and legacy `streamUrl` entries remain compatible.

## Schedules: options for a later guide

This release adds official schedule links. Service information (SI) is primarily station metadata; it must not be mistaken for programme information (PI) or a guaranteed schedule API. BBC and Global SI responses lacked browser CORS headers in checks. Tried legacy BBC JSON schedule routes and Global's guessed `PI.xml` returned 404; these are not integrated.

| Option | Requirements and trade-offs |
| --- | --- |
| Browser-accessible publisher feeds | A documented API/RSS/SPI programme feed with browser CORS. Fresh data and no infrastructure, but coverage varies by publisher. |
| Scheduled static JSON generation — recommended first | An approved publisher feed fetched by a scheduled build/job, normalized into same-origin JSON. Fits GitHub Pages without a runtime backend. Requires agreed update frequency, source usage conditions, timezone handling and stale-data labels. |
| Small backend adapter | Server-side publisher adapters with caching and refresh control. Can normalize several sources but adds hosting and operational maintenance. It does not grant access to restricted data. |

A future guide should retain programme timestamps with offsets, render in the listener's timezone, label the source and freshness, and handle UK daylight-saving changes. No schedule scraper, background job or backend is part of this release.

## Playback and verification details

Native audio handles MP3/AAC; native HLS is preferred when supported, otherwise [HLS.js](https://github.com/video-dev/hls.js) is loaded dynamically. HLS.js requires CORS for all manifests and segments. Each selection owns a separate audio element and event lifetime; switching or opening official content releases the old source. A 15-second timeout bounds initial connection and buffering stalls. Autoplay rejection retains a Play action; stream failure offers Retry and the official destination.

Unit tests cover import compatibility and URL validation, native/HLS selection, pending import cancellation, stale events, pause/resume during loading, timeout/retry, fatal errors, volume persistence and autoplay rejection. Browser checks use the production build at `/frequency/` to exercise lazy HLS chunks and GitHub Pages base paths. Chrome and WebKit UI checks passed for broadcaster filters, search, saved favourites, optional config fields, separate official tabs with no opener, audio release, mobile overflow, themes, keyboard navigation and broken-image fallback. A simulated gamepad covered direction, A and B. Chrome offline reload and media-cache exclusion passed. WebKit offline emulation failed with an internal browser navigation error, so offline Safari/PWA behaviour remains unverified. Stream checks are short playback samples, not monitoring or availability guarantees. The service worker caches first-party shell/JavaScript resources, never audio, video, range requests or third-party streams.

## Remix 3 references

The implementation follows the installed `remix@3.0.0` component and asset APIs, which match the installed runtime:

- `node_modules/remix/INDEX.md`
- `node_modules/remix/guides/05-interactivity.md`
- `node_modules/remix/src/assets/README.md`

Both development and the production static build mount the client app with `createRoot` from `remix/component`, using setup-scope state, `handle.update`, `on`/`ref` mixins and abort-scoped listeners. The Node development server serves the SPA document and first-party assets; there is no application server in production. HLS.js is allowed by the development asset server and emitted as a lazy JavaScript chunk in production.
