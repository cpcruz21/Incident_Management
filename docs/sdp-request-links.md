# ServiceDesk Plus request links

Request IDs in Aging, Monthly, IR Analytics and the shared weekly/monthly detail
dialog open SDP in a new tab. Existing IR Analytics row clicks still open the
local history dialog. Invalid/blank identifiers remain plain text.

SDP display IDs and internal IDs differ. The supplied example is:

- Display ID: `IR-53184`
- Internal ID: `129915000037909050`
- UI URL: `https://equicom.sdpondemand.manageengine.com/app/itdesk/ui/requests/129915000037909050/details`

The example mapping is not hardcoded. Clicking a link calls
`GET /api/sdp/requests/IR-53184`, which searches the portal's v3 Requests API
for `display_id = 53184`, verifies an exact unique match, and returns a `303`
redirect using the returned internal ID. No ticket details or OAuth credentials
are sent to the browser. SDP still requires the viewer's own login and permission.
The endpoint also works from published dashboards and does not require a report
admin session; its sole output is a redirect to SDP, or a fixed error message.

## Server configuration

1. Register a Zoho OAuth client using the vendor guide below. Use an account
   that can read the required requests in the `itdesk` portal and use the scope
   `SDPOnDemand.requests.READ`.
2. Copy `.env.example` to `.env.local` **inside `Incident_Management`**, alongside
   `package.json`. Set `SDP_CLIENT_ID` and `SDP_CLIENT_SECRET` locally.
   Set `SDP_OAUTH_GRANT_TYPE=client_credentials` for a Self Client that supports
   this flow. The default `refresh_token` flow also requires `SDP_REFRESH_TOKEN`.
   Keep credentials in server-only environment variables.
3. Verify `SDP_BASE_URL`, `SDP_PORTAL`, and the region's `SDP_ACCOUNTS_URL`.
   The provided tenant and example identify the `itdesk` portal. A custom tenant
   URL is supported by the API. Its data center must match the OAuth account.
4. Restart the application. Open `IR-53184` in a report and verify that it reaches
   the internal ID shown above. Verify another request as well.

The server obtains and refreshes access tokens automatically, shares an in-flight
refresh between requests, and retries the lookup once after HTTP 401. Successful
ID mappings are cached in memory for 15 minutes (at most 500 entries). Tokens and
lookup responses are excluded from Next's fetch cache. Calls time out after ten
seconds each. Errors show a readable page in the new tab while the report stays
open. Missing credentials, unknown IDs, malformed responses, and upstream errors
never produce a guessed ticket link.

## Contract and verification

Upstream lookup:

```text
GET {SDP_BASE_URL}/app/{SDP_PORTAL}/api/v3/requests
Accept: application/vnd.manageengine.sdp.v3+json
Authorization: Zoho-oauthtoken {server access token}
input_data={"list_info":{"row_count":2,"search_criteria":{"field":"display_id","condition":"is","value":"53184"}}}
```

`input_data` is URL encoded. Expected JSON has `response_status` indicating
`status_code: 2000`, and a `requests` array containing a unique exact `display_id`
match with a string `id`. Internal IDs remain strings to preserve precision.
The Equicom portal accepted the exact `display_id` filter and returned the
expected internal ID for `IR-53184` using the client credentials flow.

With Node 24 on PATH and `NO_PROXY=127.0.0.1,localhost`, run
`postman simulation run postman/simulations/sdp-links.sim.yaml --proxy --lift "node --use-env-proxy scripts/verify-sdp-links.cjs"`
from the application directory. Node 24 is needed only for the verification
proxy's environment-variable support. This exercises the real resolver and route
against local HTTP stand-ins. The stand-ins are based on the vendor contract,
not a downloaded owner mock (Postman is signed out). No real credentials are used.
Set `SDP_OAUTH_GRANT_TYPE=client_credentials` in the shell to verify that grant
with the same simulation.

Sources:

- [OAuth and request READ scope](https://www.manageengine.com/products/service-desk/sdpod-v3-api/getting-started/oauth-2.0.html)
- [Zoho Self Client credentials flow](https://www.zoho.com/developer/oauth/self-client/client-credentials-flow.html)
- [Requests API and display_id](https://www.manageengine.com/products/service-desk/sdpod-v3-api/requests/request.html)
- [Search criteria](https://www.manageengine.com/products/service-desk/sdpod-v3-api/getting-started/search-criteria.html)
- [Portal routing](https://www.manageengine.com/products/service-desk/sdpod-v3-api/getting-started/portals.html)

The supplemental WorkDrive URL opens `Oauthtoken Generation.webm`; it is a token
generation video, not a request-link mapping table. Orbit discovery was
unavailable due to network resolution, so the supplied primary documentation was
used directly.
