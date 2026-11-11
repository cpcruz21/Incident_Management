import { resolveSdpRequest, SdpError } from '@/lib/server/sdp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Available to both private reports and published dashboards; returns only a UI
// redirect, never the OAuth token or request details. SDP enforces its own login.
export async function GET(_request: Request, { params }: { params: { requestId: string } }) {
  const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
  try {
    const location = await resolveSdpRequest(params.requestId);
    return new Response(null, { status: 303, headers: { ...headers, Location: location } });
  } catch (error) {
    const failure = error instanceof SdpError ? error : new SdpError(502, 'The SDP request could not be opened. Please try again shortly.');
    // Error messages are fixed server-authored text; never render upstream bodies or input.
    return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Open request in SDP</title></head><body><main><h1>Unable to open the SDP request</h1><p>${failure.message}</p><p>You can close this tab and return to your report.</p></main></body></html>`, {
      status: failure.status,
      headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff' },
    });
  }
}
