const { PHASE_DEVELOPMENT_SERVER } = require('next/constants');

module.exports = (phase) => {
  if (phase !== PHASE_DEVELOPMENT_SERVER) return { distDir: '.next' };

  // Next sets PORT to the bound port before loading the server configuration.
  // Each dev server must own its assets because Next clears them at startup.
  const port = Number(process.env.PORT ?? 3000);
  const alternatePort = Number.isInteger(port) && port > 0 && port <= 65535 && port !== 3000;
  return { distDir: alternatePort ? `.next-dev-${port}` : '.next-dev' };
};
