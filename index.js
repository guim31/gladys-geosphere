// -----------------------------------------------------------------------------
// Entry point: wires the Gladys SDK to the GeoSphere Austria service
// (src/app.js). No weather logic here. Handlers are registered before
// connect().
//
// Environment provided by the Gladys supervisor: GLADYS_HOST_API_URL,
// GLADYS_INTEGRATION_TOKEN, GLADYS_INTEGRATION_SELECTOR (read by the SDK), and
// TZ, the time zone of Gladys (used for "tomorrow" and the displayed times).
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { registerHandlers } from './src/app.js';

const gladys = new GladysIntegration();
const app = registerHandlers(gladys);

gladys.handleShutdown(async (signal) => {
  logger.info(`Received ${signal}, stopping`);
  await app.stop();
});

logger.info('Starting the GeoSphere Austria integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
