// Server only: OAuth secrets and access tokens must never enter client components.
import { sdpDisplayId } from '@/lib/sdp/request-id';

export class SdpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const timeoutMs = 10_000;
let token: { value: string; expiresAt: number } | undefined;
let refreshing: Promise<string> | undefined;
const requests = new Map<string, { id: string; expiresAt: number }>();

function baseUrl(name: string, fallback: string): URL {
  const url = new URL(process.env[name] || fallback);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new SdpError(503, 'The SDP connection settings need to be corrected by an administrator.');
  }
  return url;
}

function settings() {
  const base = baseUrl('SDP_BASE_URL', 'https://equicom.sdpondemand.manageengine.com');
  const accounts = baseUrl('SDP_ACCOUNTS_URL', 'https://accounts.zoho.com');
  const portal = process.env.SDP_PORTAL || 'itdesk';
  if (!/^[a-zA-Z0-9_-]+$/.test(portal)) throw new SdpError(503, 'The SDP portal setting is invalid.');
  return { base, accounts, portal };
}

async function requestAccessToken(): Promise<string> {
  const clientId = process.env.SDP_CLIENT_ID;
  const clientSecret = process.env.SDP_CLIENT_SECRET;
  const grantType = process.env.SDP_OAUTH_GRANT_TYPE || 'refresh_token';
  if (grantType !== 'refresh_token' && grantType !== 'client_credentials') {
    throw new SdpError(503, 'The SDP OAuth grant type is invalid.');
  }
  const refreshToken = process.env.SDP_REFRESH_TOKEN;
  if (!clientId || !clientSecret || (grantType === 'refresh_token' && !refreshToken)) {
    throw new SdpError(503, 'The SDP connection is not configured yet. Ask an administrator to configure the server OAuth credentials.');
  }
  const body = new URLSearchParams({ grant_type: grantType, client_id: clientId, client_secret: clientSecret });
  if (grantType === 'client_credentials') body.set('scope', 'SDPOnDemand.requests.READ');
  else body.set('refresh_token', refreshToken!);

  const { accounts } = settings();
  const response = await fetch(new URL('/oauth/v2/token', accounts), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs),
  });
  const result = await response.json();
  if (!response.ok || typeof result.access_token !== 'string' || !result.access_token || result.error) {
    throw new SdpError(502, 'SDP authentication failed. Ask an administrator to check the OAuth credentials and data center.');
  }
  const lifetime = Number(result.expires_in);
  if (!Number.isFinite(lifetime) || lifetime <= 0) throw new SdpError(502, 'SDP returned an invalid token expiry.');
  token = { value: result.access_token, expiresAt: Date.now() + Math.max(0, lifetime - 60) * 1000 };
  return token.value;
}

async function accessToken() {
  if (token && token.expiresAt > Date.now()) return token.value;
  if (!refreshing) refreshing = requestAccessToken().finally(() => { refreshing = undefined; });
  return refreshing;
}

async function lookup(displayId: string, retry = true): Promise<string> {
  const { base, portal } = settings();
  const url = new URL(`/app/${portal}/api/v3/requests`, base);
  url.searchParams.set('input_data', JSON.stringify({ list_info: {
    row_count: 2,
    search_criteria: { field: 'display_id', condition: 'is', value: displayId },
  } }));
  const usedToken = await accessToken();
  const response = await fetch(url, {
    headers: { Accept: 'application/vnd.manageengine.sdp.v3+json', Authorization: `Zoho-oauthtoken ${usedToken}` },
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
  });
  if (response.status === 401 && retry) {
    if (token?.value === usedToken) token = undefined;
    return lookup(displayId, false);
  }
  if (response.status === 429) throw new SdpError(503, 'SDP is receiving too many requests. Please try again shortly.');
  if (!response.ok) throw new SdpError(502, 'The request could not be looked up in SDP. Please try again or contact an administrator.');
  const result = await response.json();
  const statuses = Array.isArray(result.response_status) ? result.response_status : [result.response_status];
  if (!statuses.length || statuses.some((status: { status_code?: number } | null) => status?.status_code !== 2000) || !Array.isArray(result.requests)) {
    throw new SdpError(502, 'SDP could not complete the request lookup. Ask an administrator to check the Requests READ scope.');
  }
  const matches = result.requests.filter((request: { display_id?: unknown }) => String(request.display_id) === displayId);
  if (!matches.length) throw new SdpError(404, 'This Request ID was not found in SDP, or the integration account cannot access it.');
  if (matches.length !== 1 || result.list_info?.has_more_rows || typeof matches[0].id !== 'string' || !/^[1-9]\d{0,29}$/.test(matches[0].id)) {
    throw new SdpError(502, 'SDP did not return a unique request. Ask an administrator to check the portal configuration.');
  }
  return matches[0].id;
}

/** Resolve the export's display ID and redirect to the tenant's normal signed-in UI. */
export async function resolveSdpRequest(requestId: string): Promise<string> {
  const displayId = sdpDisplayId(requestId);
  if (!displayId) throw new SdpError(400, 'Enter a valid Request ID, such as IR-53184.');
  try {
    const { base, portal } = settings();
    const key = `${base.origin}/${portal}/${displayId}`;
    const cached = requests.get(key);
    const internalId = cached && cached.expiresAt > Date.now() ? cached.id : await lookup(displayId);
    if (!cached || cached.expiresAt <= Date.now()) {
      if (requests.size >= 500) requests.delete(requests.keys().next().value!);
      requests.set(key, { id: internalId, expiresAt: Date.now() + 15 * 60_000 });
    }
    return new URL(`/app/${portal}/ui/requests/${internalId}/details`, base).toString();
  } catch (error) {
    if (error instanceof SdpError) throw error;
    throw new SdpError(502, 'SDP could not be reached or returned an unexpected response. Please try again shortly.');
  }
}
