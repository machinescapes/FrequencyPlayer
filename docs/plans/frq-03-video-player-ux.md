# Plan: YouTube-style TV player (frq-03)

## Context

The TV player is a fixed "stage" block at the top of the Channels page with a separate action bar (Play · PiP · ⛶ · Open stream) underneath the video. Problems seen at 1366×860 and 390×844 (`docs/screenshots/frq-03-before-*.png`):

- The full-screen toggle sits in the bar below the video instead of on it, unlike YouTube, Netflix or BBC iPlayer.
- Pressing play on a card further down the grid starts the stream in a stage that is ~1500 px (desktop) or ~780 px (phone) off-screen. On mobile you can't see the video you just started.
- The only way to watch is the big stage. There's no small way to keep watching while you browse.

User request: *"behave like the leading stream sites eg youtube. where the fullscreen toggle is overlaying the video. pressing play should get the player output window in focus on mobile. it should be possible to launch the stream without going into the full open window"*. When asked, the user chose **both** inline-in-card playback **and** a YouTube-style miniplayer, plus a **sticky top player** on mobile.

## What Gets Built

- **Overlay controls on the video.** Play/pause, live badge, PiP, expand/collapse and full screen sit on a gradient bar over the bottom of the video. They auto-hide after 3 s without pointer or touch activity while playing, and they reappear on hover, tap or focus. Double-click or double-tap toggles full screen, and `f` / `k` / `Esc` work on the keyboard.
- **Full screen on a container.** Full screen targets the player container so the overlay controls stay visible. iOS Safari, where only `<video>` can go full screen, falls back to `webkitEnterFullscreen()`. On mobile, landscape is locked when `screen.orientation.lock` is available.
- **Three player modes for Watch.** One `<video>` element is moved between three hosts:
  - `inline`: on desktop and tablet (>540 px), **pressing play on a card plays the video inside that card's artwork tile**, with the overlay controls scaled down. No big stage opens.
  - `mini`: when the inline card scrolls out of view, or the user changes view or scope, the video docks into the bottom player bar as a live 16:9 thumbnail. Tapping the thumbnail or ⤢ expands it, and × stops playback.
  - `expanded`: the existing stage, now with overlay controls. It opens from ⤢ on any mode. Collapse ⤡ returns to inline if the card is on screen and to mini otherwise.
- **Mobile (≤540 px).** Pressing play opens `expanded` as a **sticky player docked under the top bar** (16:9). The grid keeps scrolling underneath, so the video is always in view. Collapse turns it into the mini bar. Tiles on a three-column phone grid are too small to be useful inline players, so mobile skips inline.
- In the Guide view, the expanded stage keeps its current compact strip. Inline isn't used there, so it falls back to mini.
- Radio/Listen behaviour is unchanged (audio only, existing bottom bar).

## Implementation Steps

1. **Mode state (`app/public/entry.tsx`).** Add `let playerMode: 'inline' | 'mini' | 'expanded' = 'inline'` and a `narrow` media query (`matchMedia('(max-width: 540px)')`, with a listener tied to `handle.signal`). `play(item)` for watch items sets the mode to `narrow ? 'expanded' : (view === 'Channels' ? 'inline' : 'mini')`, unless the user is already in `expanded`, in which case it stays there. On narrow screens, after `update()` it calls `stage.scrollIntoView({ block: 'start' })` only when the sticky player isn't already pinned.
2. **Video host routing.** Replace `mountVideo`/`attachVideoSoon` with one `videoHost(mode)` ref helper. The card art for `selected` (inline), the mini thumb (mini) and `.stage-media` (expanded) each register as the host for their mode. After every render, a single rAF moves `video` into the active host. Moving the element synchronously keeps it playing (the media "removed from document" steps don't pause an element that is re-inserted in the same task).
3. **Inline → mini hand-off.** An `IntersectionObserver` (threshold 0.25) on the inline host switches the mode to `mini` when the card leaves the viewport. It goes back to `inline` when the card returns, but only if the mode was set automatically, never after an explicit expand. It's disconnected on `handle.signal` abort.
4. **Overlay component.** Add a `videoControls(variant)` render function inside `entry.tsx` (local, like `card()`), used by the stage and the inline tile. It renders a `.vc` overlay with `data-idle` driven by a pointer/touch idle timer (3 s), which is cleared while paused, connecting, failed or focused. The buttons are play/pause, `● LIVE`, PiP, ⤢/⤡ and ⛶. The existing `stage-status` connecting/failed messages stay as they are. The old `.stage-actions` buttons move into the overlay, and "Open stream ↗" stays in the info row under the stage.
5. **Full screen.** Add `toggleFullscreen(container)`: use `container.requestFullscreen()` if it exists, otherwise `video.webkitEnterFullscreen()`; then `screen.orientation?.lock?.('landscape').catch(() => {})` on touch devices. A `fullscreenchange` listener re-renders so the icon switches. Keyboard shortcuts are added to the existing document `keydown` handler and skipped while typing or while a dialog or the palette is open.
6. **Mini bar.** In `.player`, when `selected?.source === 'watch' && playerMode === 'mini'`, `.mini-art` becomes a 16:9 `.mini-video` host (button: "Expand player"). It gets an expand ⤢ and a close × next to the play button.
7. **CSS (`public/styles.css`, new `@layer media` block).** Add `.vc` overlay and gradient, the idle fade, and inline-tile sizing (`.card.playing .art` holds the video with `object-fit: cover`, and its art-play/logo are hidden). Add `.mini-video` at 16:9, ~120 px wide on desktop and ~96 px on phone. Add `:fullscreen` rules so the player fills the screen and the video is `contain`. Under ≤540 px, `.stage` gets `position: sticky; top: 0; z-index: 8` with `aspect-ratio: 16/9`. All touch targets are ≥ 40 px. Respect `prefers-reduced-motion`.
8. **Docs.** Add a "Watching" subsection to the README covering the modes and shortcuts.

## Critical Files

| File | Change |
|---|---|
| `app/public/entry.tsx` | player mode state, host routing, IntersectionObserver, overlay controls, full screen helper, keyboard shortcuts, mini bar video |
| `public/styles.css` | overlay controls, inline tile, mini video, sticky mobile stage, `:fullscreen` rules |
| `README.md` | Watching modes + keyboard shortcuts |
| `feature_list.json`, `frequency-progress.md`, `session-handoff.md` | state and evidence |

`playback.ts` doesn't change: it already plays through the single shared element.

## Verification

- `pnpm run check`: typecheck, lint and all tests stay green. `entry.tsx` has no unit tests and the mode logic is UI-bound, so the evidence comes from the browser checks.
- Browser (Chrome via Playwright against `pnpm run dev`, `?scope=watch&view=channels`), using a channel with health `ok`:
  - Desktop 1366×860: play a card in row 3 and check that the video plays **inside the card** (`video.parentElement` is in the card and `readyState ≥ 3`) with no stage. Scroll it away and check it docks to mini and keeps playing. Expand gives the stage with overlay ⛶ on the video. Full screen puts the container in `document.fullscreenElement` with the controls visible.
  - Phone 390×844 (touch): play a card far down the grid and check that the video's bounding box is in the viewport straight away (sticky top). Scroll the grid and check the video stays pinned. Collapse gives the mini bar and playback continues.
  - Edge cases: a failed/offline channel shows the error over the inline or stage video. Switching to `&view=guide` while inline gives mini. Switching to `?scope=listen` leaves radio playback unchanged. There are no console errors.
- Screenshots go in `docs/screenshots/frq-03-*.png`.
