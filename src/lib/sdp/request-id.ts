/** SDP display IDs from exports are distinct from the internal IDs in ticket URLs. */
export function sdpDisplayId(requestId: string): string | null {
  const match = /^(?:IR-)?([1-9]\d{0,19})$/i.exec(requestId.trim());
  return match?.[1] ?? null;
}
