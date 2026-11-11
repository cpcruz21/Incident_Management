# SMAC Reporting

Request IDs can open their matching ServiceDesk Plus request in a new tab. Configure the server OAuth credentials using [SDP request link setup](docs/sdp-request-links.md) and `.env.example`. Access tokens refresh automatically; the browser receives only the SDP request URL.

From the application directory, run `npm run setup:admin` to create the first super admin. The command displays a randomly generated password once. To choose a username, run `npm run setup:admin -- your-username`. Then run `npm run dev` and sign in.

Development assets use `.next-dev`; production builds use `.next`. This allows `npm run build` to run without replacing a running localhost development server’s CSS or JavaScript.

Super admins can create admin accounts in User Management and delete archived reports. Admins can generate, edit, archive, and publish reports. Both roles can change their own passwords.

User Management also lets super admins reset administrator passwords and delete accounts with confirmation. Audit Logs is a separate super-admin-only sidebar module with searchable account and report activity. See [account management and audit history](docs/account-management.md) for behavior, storage, and verification.

In a monthly report, admins can open Acceptable First Response, enter a Request ID, validate it against the report, and confirm the exception before choosing Add to Acceptable FR. This updates FR totals immediately and keeps the original overdue data. Archive the report to save the approval; publish it to reflect the change on the public dashboard. The public view does not show the add controls. Run `node scripts/verify-acceptable-fr.cjs` to verify this flow's validation, totals, and visibility.

Private archives are stored in `data/weekly`, `data/monthly`, and `data/aging`. Published aging and monthly reports are stored separately from private archives in their category folders. Existing flat JSON files are copied to their matching folders on first access. Existing browser archives import after sign-in on the same browser and origin.

Aging report creation copies the latest stored Aging report’s current First Response and Resolution SLA results into the new report’s last-week snapshot, including each team and the overall totals. Saving that new report makes its current results the baseline for the next report. The Previous Week step loads the snapshot automatically; another saved extract can be selected. Missing rates appear as —, and failed counts use pale pink cells with bold red text. The comparison is included in saved/published reports and Excel exports. Run `node scripts/verify-aging-carry-over.cjs` to verify save/create/save/create carry-over, and `node scripts/verify-aging-sla.cjs` to verify report reload, display, and export.

SLA uses the imported overdue flags when available. Non-ISS First Response retains the before-8:30 AM, from-5:30 PM, and weekend exceptions; ISS operates 24/7. Admin-approved FR exceptions remain accepted. Missing or invalid overdue flags produce import warnings before timestamp-based fallback calculations. Calculations do not overwrite original imported flags.

Aging reports keep separate snapshots of Recent Update, Department, and Responsible Team. A new report copies the latest saved note for each matching Request ID once; subsequent edits affect only the report being edited. Reopen a saved report to correct that specific extract. Row and bulk saves update its private archive; **Archive Report** also publishes its snapshot. Separate reports can share the same period label. Existing reports retain their archive IDs and saved remarks instead of loading the shared follow-up list. Run `node scripts/verify-aging-snapshots.cjs` to verify carry-forward, row/bulk saves, isolation, reopening older reports, publication, exports, and failure handling.

Choose **Aging as of** to match the extraction timestamp for historical imports. Aging uses calendar dates consistently in the distribution and Remarks table: same day, 1–3 days, 4–6 days, 7–13 days, 14–30 days, and over 30 days. Missing/invalid creation dates, future tickets relative to the chosen timestamp, and duplicate IDs stop Aging report generation instead of silently changing totals. Additional teams appear in the report. Run `node scripts/verify-raw-calculations.cjs` to check the actual XLSX import, raw SLA rules, boundaries, and saved raw datasets. `node scripts/reconcile-aging-raw.cjs` previews a saved-report recalculation; `--apply` makes backups before updating calculations and last-week snapshots.

Use a single application instance with a persistent, writable data directory. To override it, set `SMAC_DATA_DIR` to an absolute path. Back up this directory, including `users`. For HTTPS behind a reverse proxy, set `SMAC_SECURE_COOKIES=true` and preserve the original Host header.

See the [local UAT runbook](docs/uat.md) for dashboard links, QA account setup, and acceptance checks.
