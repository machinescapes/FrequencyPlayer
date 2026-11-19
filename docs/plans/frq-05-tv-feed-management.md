# Plan: TV feed management (frq-05)

## Context
User approved the conversational plan on 2026-11-18: default IPTV-org UK M3U, multiple enabled feeds, individual/bulk channel selection, browser verification, grouped streams, XMLTV and an Add channels entry point. Browser tests and screenshots embedded in the PR are required.

## What Gets Built
- IPTV-org UK enabled by default; optional Free-TV country feeds. URL/file imports immediately show a searchable channel list, per-feed/entry toggles, bulk filtered toggles, refresh, verification and settings transfer.
- Visible Add channels links beside Watch controls and in the empty state open channel management.
- Group canonical channel identities; preserve regions/time shifts; allow manual grouping and EPG mapping. Remember preferred streams with inline fallback; external links require a click.
- Initial imports enabled; newly discovered entries after refresh disabled. Local IndexedDB snapshots/configuration; export includes uploaded content and choices, excludes remote guide caches.
- Muted isolated browser probes, concurrency two, 15s timeout, progressing playback required. Confirmed failures excluded; inconclusive checks unchanged; manual overrides preserved.
- Custom XMLTV URL/XML/XML.GZ and broad built-in UK listings with variant-aware matching. Manual mapping wins, custom guide then built-in. Cache last valid guide; no runtime backend.

## Implementation Steps
1. Add pure feed parsing, reconciliation, grouping, guide matching, configuration validation and IndexedDB persistence modules.
2. Add isolated cancellable verification and a feed manager UI integrated into Watch, grouped playback and Guide. Retain radio and legacy favourites.
3. Extend UK guide sync beyond build-known channels, default feed snapshot refresh, dynamic XML parser assets and offline manifests in dev and production.
4. Add deterministic model/lifecycle tests and browser fixture flows; test desktop/mobile Add channels, imports/errors, switches/bulk/refresh, playback/fallback/external, probes/cancel/overrides, EPG/mappings, reload/export/import/offline and Listen/All regressions.
5. Record evidence, document usage, commit and open linked-issue PR with embedded captioned screenshots.

## Critical Files
| Area | Changes |
| --- | --- |
| app/public/ | Feed model/storage, verification, XMLTV parsing, management UI and player integration |
| scripts/ and public/ | Default snapshot, broad guide output and offline assets |
| test/ and docs/ | Unit/browser fixtures, browser evidence and instructions |

## Verification
`pnpm run check`, `pnpm run build`, required snapshot check (record upstream drift separately), real browser desktop/mobile development and static-build tests with screenshots. No feature completion claim without browser evidence. FRQ-05 stays in_progress pending review/merge per developer-workflow.
