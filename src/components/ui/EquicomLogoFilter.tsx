/** Darken the white lettering while preserving the gold artwork and transparency. */
export function EquicomLogoFilter() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute' }}>
      <defs>
        <filter id="equicom-light-lettering" colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
          {/* Gold has little blue; white lettering has a full blue channel. */}
          <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 1 0 0  0 0 1 0 0  0 0 1 0 0  0 0 0 0 1" />
          <feComponentTransfer result="letteringMask">
            <feFuncR type="linear" slope="-5" intercept="5" />
            <feFuncG type="linear" slope="-5" intercept="5" />
            <feFuncB type="linear" slope="-5" intercept="5" />
          </feComponentTransfer>
          <feBlend in="SourceGraphic" in2="letteringMask" mode="multiply" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
      </defs>
    </svg>
  );
}
