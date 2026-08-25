# Production bundle composition — 2026-08-25

## Method

- Baseline commit: `991c3fe` (the dispatch commit is documentation-only).
- Build command: `npm run analyze:bundle`.
- Analyzer: `rollup-plugin-visualizer` `7.1.1`, `template: "raw-data"`, gzip attribution enabled.
- Raw analyzer output: `/tmp/tennis-partner-finder-bundle-composition-2026-08-25.json` (temporary, intentionally not committed).
- The plugin is enabled only when `BUNDLE_ANALYZE=1`; ordinary `vite build` does not load it into the Rollup plugin pipeline.
- The analysis command still uses Vite's production mode, so the production mock-data alias and both compile-time defines are identical to the ordinary production build.

The visualizer's `renderedLength` is a module attribution measure before final chunk-level minification, while `gzipLength` compresses each module attribution independently. Those columns are useful for relative composition and candidate selection, but they are not additive substitutes for the emitted chunk's raw/gzip size. All before/after acceptance uses the actual emitted files.

## Emitted baseline

| asset class                       |                            result |
| --------------------------------- | --------------------------------: |
| main entry JS                     |        661,080 raw / 192,693 gzip |
| lazy Sentry SDK                   |          87,975 raw / 29,721 gzip |
| lazy React surfaces               | 13 chunks; 0.77–16.91 kB raw each |
| total module attributions in main |                               150 |

An ordinary `npm run build` after the analysis build emitted the same main chunk size and hash (`index-Bsbq_1gq.js`), confirming that analysis mode does not alter production output.

## Main chunk: top 20 module attributions

| rank | module                                         | rendered bytes | per-module gzip bytes |
| ---: | ---------------------------------------------- | -------------: | --------------------: |
|    1 | `react-dom/cjs/react-dom-client.production.js` |        552,879 |                95,428 |
|    2 | `@supabase/auth-js/GoTrueClient.js`            |        253,214 |                44,276 |
|    3 | `@supabase/postgrest-js/index.mjs`             |        106,100 |                21,456 |
|    4 | `@supabase/storage-js/index.mjs`               |        106,059 |                19,369 |
|    5 | `@supabase/phoenix/phoenix.mjs`                |         54,182 |                12,695 |
|    6 | `@supabase/auth-js/GoTrueAdminApi.js`          |         36,217 |                 5,807 |
|    7 | `@supabase/supabase-js/index.mjs`              |         34,630 |                 9,922 |
|    8 | `@supabase/auth-js/lib/webauthn.js`            |         33,385 |                 6,360 |
|    9 | `src/app/App.tsx`                              |         31,720 |                 6,406 |
|   10 | `@supabase/realtime-js/RealtimeChannel.js`     |         31,094 |                 7,432 |
|   11 | `src/sheets/SessionDetailSheet.tsx`            |         29,615 |                 5,940 |
|   12 | `src/views/sessionFormViews.js`                |         25,317 |                 7,580 |
|   13 | `src/sessionController.js`                     |         25,156 |                 6,810 |
|   14 | `@supabase/realtime-js/RealtimeClient.js`      |         25,023 |                 6,086 |
|   15 | `src/sessionPresentation.ts`                   |         24,754 |                 7,169 |
|   16 | `src/main.js`                                  |         22,439 |                 6,218 |
|   17 | `src/sessionViews.js`                          |         18,887 |                 4,094 |
|   18 | `src/data/repositories/dataRepository.ts`      |         18,842 |                 3,958 |
|   19 | `react/cjs/react.production.js`                |         18,321 |                 4,503 |
|   20 | `src/controller/intentController.ts`           |         16,221 |                 3,819 |

## Category totals in the main chunk

The categories are disjoint and cover all 150 main-chunk module attributions.

| category                 | rule                                 | modules | rendered bytes | per-module gzip bytes |
| ------------------------ | ------------------------------------ | ------: | -------------: | --------------------: |
| Supabase SDK             | `node_modules/@supabase/**`          |      36 |        790,851 |               165,748 |
| React runtime            | `react`, `react-dom`, `scheduler`    |      24 |        592,988 |               106,595 |
| other application source | `src/**` excluding rows below        |      73 |        422,776 |               121,062 |
| `src/data/repositories`  | repository + selects                 |       2 |         20,747 |                 4,633 |
| other `src/data`         | errors and mappers                   |       7 |         18,282 |                 5,367 |
| other third party        | `iceberg-js`, `tslib`                |       3 |         17,998 |                 4,313 |
| private features         | chat, notification, player-directory |       3 |          7,806 |                 2,572 |
| Vite runtime             | module preload + preload helper      |       2 |          3,486 |                 1,455 |

### Requested private-feature answer

| private feature module                        | rendered bytes | per-module gzip bytes |
| --------------------------------------------- | -------------: | --------------------: |
| notification settings/mutations               |          4,424 |                 1,242 |
| player directory aggregation/mutation support |          2,725 |                   981 |
| chat helpers                                  |            657 |                   349 |
| **total**                                     |      **7,806** |             **2,572** |

These helpers are currently reached by eager controller or main imports. Moving controller ownership is explicitly out of scope. Notification orchestration is a possible conditional-import candidate, but its stand-alone expected gain is small and it is involved in auth/profile initialization; it should not be split unless the repository split leaves a clear, low-risk boundary.

### Requested repository answer

| repository module   | rendered bytes | per-module gzip bytes |
| ------------------- | -------------: | --------------------: |
| `dataRepository.ts` |         18,842 |                 3,958 |
| `selects.ts`        |          1,905 |                   675 |
| **total**           |     **20,747** |             **4,633** |

`dataRepository.ts` is a monolith: anonymous court/discovery/session-summary reads and authenticated profile, notification, directory, chat and mutation paths share one eager module. The public methods must stay eager, but the authenticated implementations can be moved behind dynamic import inside this repository without changing `dataApi.js` or controller contracts.

## Candidate decisions before implementation

| candidate                                      |                        composition evidence | decision                                                                                                                                                                                  |
| ---------------------------------------------- | ------------------------------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| defer the whole Supabase SDK                   |  790,851 rendered / 165,748 attributed gzip | do not attempt: anonymous discovery, court catalogue and initial auth restore all need the client; making this lazy would add a startup waterfall or require a different public transport |
| defer React runtime                            |                           592,988 / 106,595 | do not attempt: the map shell, nearby drawer and bottom navigation are React-owned on first render                                                                                        |
| use `manualChunks` for Supabase/React          |                                same numbers | reject as a performance claim: eager imports would still request those chunks before the entry can execute; useful only for cache topology, which is not this batch's target              |
| defer authenticated repository implementations | up to 20,747 / 4,633 repository attribution | implement first: keeps public discovery eager while anonymous first load no longer requests the private implementation chunk                                                              |
| defer private feature helpers                  |                               7,806 / 2,572 | reassess after the repository split; do not move controller boundaries, and do not pay extra async orchestration for a marginal isolated gain                                             |

The expected physical saving from repository extraction is smaller than 20,747 rendered bytes because the eager public side retains shared types, mappers, error handling and RPC adapter glue. Acceptance therefore requires an actual emitted main-chunk decrease from 661,080/192,693 and an anonymous-network assertion; attribution alone is not counted as a win.
