const { PHASE_DEVELOPMENT_SERVER } = require('next/constants');

/** Keep production verification from replacing a running dev server's assets. */
module.exports = (phase) => ({
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
});
