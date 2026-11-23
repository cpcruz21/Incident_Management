# SMAC Reporting local UAT

| Dashboard | UAT address | Access |
| --- | --- | --- |
| Admin | [192.168.98.34:3100](http://192.168.98.34:3100/) | QA admin. Super-admin sign-in is available on the UAT computer. |
| Public | [192.168.98.34:3100/public-dashboard](http://192.168.98.34:3100/public-dashboard) | Guest view with published reports |

Open the same links on the host, on the same Wi-Fi, or through VPN1. Use a private browser window for the guest checks. Upload only [synthetic incidents](uat-sample-incidents.csv). The sample covers November 2026 and includes open and closed tickets with mixed SLA results. For Aging, set the extraction time to November 7, 2026 at noon or later.

The initial UAT instance includes a synthetic publication and private archive in each of Weekly SLA, Aging, and Monthly. Give new QA reports distinct period labels so they are easy to identify.

## QA access on the same Wi-Fi

Like Support Productivity, Incident Management has one sign-in URL on Wi-Fi. On the host computer, use `uat-superadmin` at that URL to manage tester accounts. Testers use QA admin accounts on their devices. A VPN is unnecessary for this route.

## QA access over FortiClient

From home, connect to **VPN1** in FortiClient and paste the UAT link above directly into the browser. Use a QA admin account for sign-in. If the Wi-Fi address is unreachable through VPN1, try the host's VPN address at [192.168.39.143:3100](http://192.168.39.143:3100/) or open the [guest dashboard](http://192.168.39.143:3100/public-dashboard). Keep the host connected to VPN1 for these links.

If a tester cannot connect to the VPN address, run `Test-NetConnection 192.168.39.143 -Port 3100` from their device while VPN1 is connected. A failed TCP check needs investigation of routing and firewall access between VPN1 clients. The app matches each approved tester against the source IPv4 address received by the listener.

## Grant QA access

Sign in as `uat-superadmin` and open **User Management**. Create a named admin for each tester, or reset the password of the pre-created `qa-admin` account. Give each tester their own temporary password privately and have them change it from their account menu. Revoke accounts in User Management when testing ends.

The recovery copy for the shared Wi-Fi super-admin password is encrypted for the Windows user who provisioned UAT. From the app directory, this PowerShell command copies it to the clipboard. Refresh the recovery copy if you change the password again.

```powershell
$secret = Get-Content -Raw .uat-runtime/credentials/qa-lan-superadmin.dpapi
$password = ConvertTo-SecureString $secret.Trim()
[Net.NetworkCredential]::new('', $password).Password | Set-Clipboard
```

## Acceptance checks

| Check | Expected result |
| --- | --- |
| Open the admin URL signed out | The sign-in form appears. Private report and admin APIs require a session. |
| Sign in as QA and as super admin in separate browser profiles | Both roles can generate and publish reports. Only the super admin can manage users and view audit logs. |
| Import the sample CSV into Weekly SLA, Aging, and Monthly | The workflows recognize the columns. Verify the report totals against the four sample rows and review the open and overdue cases. |
| Export XLSX from each report as an administrator | Weekly SLA and Aging open on Raw Data with all four imported tickets and their routed technicians. Monthly contains one All Tickets sheet. XLSX export requires an administrator. |
| Use Save images in Weekly SLA, Aging, and Monthly SLA | The admin and guest views show previews and download the Weekly SLA Objectives as a table-sized PNG and the other report images as 1920 × 1080 PNGs. |
| Generate a new report, then archive and reopen it | The generation heading and steps stay visible through the final Report step for new reports. Reopening a report from Archive starts directly at the saved report header. |
| Save a weekly report edit to a past period | The guest Weekly SLA tab updates the original period and keeps newer reports in place. |
| In a newly imported Weekly report, approve `99000002` in Acceptable First Response, then delete `99000001` | The approval moves one ticket from FR Failed to FR Passed and keeps its resolution failure. Deletion reduces the report total by one. Archive and reopen to verify both changes. |
| In a newly imported Aging report, approve `99000004`, then delete `99000003` | The approval moves one ticket from FR Failed to FR Passed. Deletion removes the ticket from the SLA totals, Aging Distribution, and Remarks Table. Archive and reopen to verify both changes. |
| Publish Aging and Monthly reports and open the guest dashboard | The selected reports appear in their respective tabs without edit or publish controls. |
| Restart UAT and reopen the public dashboard and private archives | Published reports, archives, and UAT accounts remain available. |

ServiceDesk Plus request links use the UAT OAuth settings when provisioned. Verify that a known request opens the configured SDP portal and that SDP applies the viewer's sign-in and permissions. For sign-off, record the release tested, pass or fail for each scenario, and any open defects.

## Restart and storage

The current UAT build is recorded in `.uat-runtime/qa-lan.release` and its data is in `.uat-runtime/qa-lan-data`. Back up the UAT data directory before replacing the release. Run one server against this data directory at a time.

To provision or rotate the SDP credentials, run `./scripts/uat-sdp-config.ps1 -FromEnvFile .env.local` from the app directory under the Windows account that runs UAT. Use the server settings in [SDP request link setup](sdp-request-links.md). The script saves a Windows-encrypted copy under `.uat-runtime/credentials` outside the release directories. Load it before every UAT start.

The launcher reads `qa-vpn.json` from the UAT data directory. Set `host` to the host's FortiClient IPv4 and `peers` to the array of approved QA FortiClient IPv4 addresses. The Wi-Fi listener starts while the VPN listener waits for the configured FortiClient address. If the host or a tester receives a different VPN address, edit this file and restart the listener. Each release that uses the same data directory reads the same allowlist.

Match the PID in `.uat-runtime/qa-lan.pid` against the listener on `192.168.98.34:3100` in `netstat -ano -p TCP` before stopping that process. Run the following from the app directory, using the host's Wi-Fi address and prefix length. Use `Ctrl+C` to stop a server started in this session.

```powershell
$uatRoot = Join-Path (Get-Location).Path '.uat-runtime'
$env:SMAC_DATA_DIR = Join-Path $uatRoot 'qa-lan-data'
$env:SMAC_UAT = 'true'
$env:SMAC_SECURE_COOKIES = 'false' # HTTP on the local network
$env:NEXT_TELEMETRY_DISABLED = '1'
./scripts/uat-sdp-config.ps1
Set-Location -LiteralPath ((Get-Content -Raw (Join-Path $uatRoot 'qa-lan.release')).Trim())
node scripts/start-uat-lan.cjs 192.168.98.34 24
```

To refresh the snapshot, build in a new release directory. Copy `src`, `public`, `package.json`, `package-lock.json`, `next.config.js`, `tsconfig.json`, `scripts/setup-admin.mjs`, and `scripts/start-uat-lan.cjs` from the app. Install with `npm ci`, set the UAT build environment, and run `npm run build`. Stop the old process before starting the replacement on port 3100. Load the SDP settings at startup and reuse the same UAT data directory. Keep the previous build available for rollback.
