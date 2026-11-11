# Weekly SLA publishing

Public navigation is Dashboard / Weekly SLA / Aging / Monthly. Weekly SLA displays the weekly summaries and a published-period selector. Click a Total, Passed, or Failed count to list its request IDs. Each ID opens the matching ServiceDesk Plus request in a new tab, where SDP applies the viewer's own access. If an older publication lacks request IDs, republish it from the original archived report.

`GET /api/reports/weekly` is public, returns `{ "success": true, "reports": [...] }`, and uses `Cache-Control: no-store`. It reads only `data/weekly/weekly-reports.json`, never the private archive. An empty publication history returns an empty reports array.

`POST /api/reports/weekly` requires an authenticated admin and the existing same-origin check. The JSON body has `title`, `period`, `reportData` (`WeeklyReportData`), optional `id`, and optional `routedIncidents`. Each SLA row must have nonnegative integer counts, passed + failed = total, valid incident-ID arrays, and a pass rate consistent with its counts (null when total is zero). The report also requires a generation timestamp, team order, and previous-week SLA maps and totals. Invalid authenticated payloads return 400. Authentication/origin failures retain the existing 401/403 behavior.

Publishing keeps the report title, period, generation timestamp, totals, percentages, and valid SDP display IDs for current-week First Response and Resolution Time tickets. It adds the server save time and strips raw incident rows, staff names, and unrelated fields. It replaces the published copy for the same period or ID; other periods remain available. Publishing is a separate admin action from private archiving. A successful publish broadcasts `smac_report_updates`, so open public dashboards refresh; focus and periodic refresh also remain supported.

`node scripts/verify-weekly-publication.cjs` verifies storage isolation, payload validation, replacement/history, server metadata, and public/admin controls using a temporary data directory and simulated authentication. Live unauthenticated GET and rejected POST are checked separately against localhost.
