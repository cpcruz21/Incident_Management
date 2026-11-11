# SMAC Reporting local UAT

| Dashboard | Local address | Access |
| --- | --- | --- |
| Admin | [127.0.0.1:3100](http://127.0.0.1:3100/) | UAT admin or super admin |
| Public | [127.0.0.1:3100/public-dashboard](http://127.0.0.1:3100/public-dashboard) | Guest view with published reports |

Both links work on the computer running UAT. Use a private browser window for the guest checks. Upload only [synthetic incidents](uat-sample-incidents.csv). The sample covers November 2026 and includes open and closed tickets with mixed SLA results. For Aging, set the extraction time to November 7, 2026 at noon or later.

The initial UAT instance includes a synthetic publication and private archive in each of Weekly SLA, Aging, and Monthly. Give new QA reports distinct period labels so they are easy to identify.

## QA access over FortiClient

Once the VPN listener has been started with the approved QA addresses, connect to the company FortiClient VPN before opening either link.

| Dashboard | VPN address | Access |
| --- | --- | --- |
| Admin | [192.168.39.143:3100](http://192.168.39.143:3100/) | QA admin |
| Public | [192.168.39.143:3100/public-dashboard](http://192.168.39.143:3100/public-dashboard) | Guest view over the VPN |

The host and tester both need to stay connected. The listener accepts the exact approved QA VPN IPv4 addresses. Super admins sign in using the loopback link on the UAT computer. If a tester still cannot connect, have them run `Test-NetConnection 192.168.39.143 -Port 3100` while connected. If the TCP check fails, ask the FortiGate administrator to verify routing and TCP 3100 access between the QA VPN clients and the UAT host. Update the allowlist if a tester reconnects and receives a different VPN address. If the UAT host receives a new VPN address, update the listener and share the new links.

## Grant QA access

Sign in as `uat-superadmin` and open **User Management**. Create a named admin for each tester, or reset the password of the pre-created `qa-admin` account. Give each tester their own temporary password privately and have them change it from their account menu. Revoke accounts in User Management when testing ends.

The bootstrap passwords for `uat-superadmin` and `qa-admin` are encrypted for the Windows user who provisioned the environment. From the app directory, this PowerShell command copies the super-admin password to the clipboard. Use `qa-admin.dpapi` in the same command for the starter QA account. These files contain the original passwords and can be removed after the passwords are changed.

```powershell
$secret = Get-Content -Raw .uat-runtime/credentials/uat-superadmin.dpapi
$password = ConvertTo-SecureString $secret.Trim()
[Net.NetworkCredential]::new('', $password).Password | Set-Clipboard
```

## Acceptance checks

| Check | Expected result |
| --- | --- |
| Open the admin URL signed out | The sign-in form appears. Private report and admin APIs require a session. |
| Sign in as QA and as super admin in separate browser profiles | Both roles can generate and publish reports. Only the super admin can manage users and view audit logs. |
| Import the sample CSV into Weekly SLA, Aging, and Monthly | The workflows recognize the columns. Verify the report totals against the four sample rows and review the open and overdue cases. |
| Archive a weekly report, then publish it | It stays private when only archived. After publication, it appears in the guest Weekly SLA tab. |
| Publish Aging and Monthly reports and open the guest dashboard | The selected reports appear in their respective tabs without edit or publish controls. |
| Restart UAT and reopen the public dashboard and private archives | Published reports, archives, and UAT accounts remain available. |

ServiceDesk Plus OAuth is omitted from this UAT environment. Record live request-link resolution as pending sandbox credentials. For sign-off, record the release tested, pass or fail for each scenario, and any open defects.

## Restart and storage

The current UAT production build is in `.uat-runtime/release-monthly-table`. Its data is in `.uat-runtime/data`, separate from the application's normal data. Back up the UAT data directory before replacing the release. Keep one UAT server process running at a time.

If the background instance is running, match the PID in `.uat-runtime/server.pid` against the listener on `127.0.0.1:3100` in `netstat -ano -p TCP` before stopping that PID. With FortiClient connected, confirm the host VPN address and each approved QA VPN address before running the following from a fresh PowerShell session in the app directory. Use `Ctrl+C` to stop a server started in this session.

**Edit the `$qaVpnIps` line below.** On each tester's computer, open FortiClient after connecting to VPN1 and copy the **IP Address** shown directly beneath **VPN Name**. Enter one quoted address per tester, separated by commas. The address `192.168.39.143` on the final line is the UAT host's address.

```powershell
$uatRoot = Join-Path (Get-Location).Path '.uat-runtime'
$env:SMAC_DATA_DIR = Join-Path $uatRoot 'data'
$env:SMAC_UAT = 'true'
$env:SMAC_SECURE_COOKIES = 'false' # HTTP on loopback and inside the VPN
$env:NEXT_TELEMETRY_DISABLED = '1'
Get-ChildItem Env: | Where-Object Name -Like 'SDP_*' | ForEach-Object {
    Remove-Item -LiteralPath ('Env:' + $_.Name)
}
Set-Location (Join-Path $uatRoot 'release-monthly-table')
$qaVpnIps = @('REPLACE_WITH_APPROVED_QA_IPV4') # EDIT HERE with the confirmed QA addresses
node scripts/start-uat-vpn.cjs 192.168.39.143 @qaVpnIps
```

To run with loopback only, replace the final command with `npm run start -- --hostname 127.0.0.1 --port 3100`.

To refresh the snapshot, build in a new release directory. Copy `src`, `public`, `package.json`, `package-lock.json`, `next.config.js`, `tsconfig.json`, `scripts/setup-admin.mjs`, and `scripts/start-uat-vpn.cjs` from the app. Install with `npm ci`, set the UAT environment above, and run `npm run build`. Stop the old process before starting the replacement on port 3100. Reuse the same UAT data directory. Keep the previous build available for rollback.
