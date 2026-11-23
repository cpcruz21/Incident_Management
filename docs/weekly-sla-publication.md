# Weekly SLA publishing

Public navigation is Dashboard / Weekly SLA / Aging / Monthly. Weekly SLA displays the weekly summaries and a published-period selector. Click a Total, Passed, or Failed count to list its request IDs. Each ID opens the matching ServiceDesk Plus request in a new tab, where SDP applies the viewer's own access. If an older publication lacks request IDs, republish it from the original archived report.

`GET /api/reports/weekly` is public, returns `{ "success": true, "reports": [...] }`, and uses `Cache-Control: no-store`. It reads only `data/weekly/weekly-reports.json`, never the private archive. An empty publication history returns an empty reports array.

`POST /api/reports/weekly` requires an authenticated admin and the existing same-origin check. The JSON body has `title`, `period`, `reportData` (`WeeklyReportData`), optional `id`, and optional `routedIncidents`. Each SLA row must have nonnegative integer counts, passed + failed = total, valid incident-ID arrays, and a pass rate consistent with its counts (null when total is zero). The report also requires a generation timestamp, team order, and previous-week SLA maps and totals. Invalid authenticated payloads return 400. Authentication/origin failures retain the existing 401/403 behavior.

The admin **Archive report** action sends one Weekly report to `POST /api/reports/archive` with `weeklyPublication: true`. When editing an existing archive it also sends `expectedSavedAt`. The endpoint rejects stale saves with HTTP 409. It responds with `publication: "updated"` after saving the archive and live copy, or `publication: "failed"` if the archive saved and the live update needs to be retried.

Publishing keeps the report title, original period, generation timestamp, totals, percentages, and valid SDP display IDs. The private archive retains raw incident rows and staff names. An edit updates the existing live entry for that period in place, keeping its published ID and position in the period list. After a successful save, open dashboard tabs on the same browser refresh through `smac_report_updates`. Other sessions refresh on focus or through periodic polling.

`node scripts/verify-weekly-publication.cjs` verifies storage isolation, payload validation, replacement/history, server metadata, and public/admin controls using a temporary data directory and simulated authentication. Live unauthenticated GET and rejected POST are checked separately against localhost.
