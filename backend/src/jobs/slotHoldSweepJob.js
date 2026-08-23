const cron = require('node-cron');
const logger = require('../config/logger');
const slotService = require('../services/slotService');

function startSlotHoldSweepJob() {
  const expr = process.env.SLOT_HOLD_SWEEP_CRON || '* * * * *';
  cron.schedule(expr, () => {
    slotService.releaseExpiredHolds().catch((err) => logger.error(`Slot hold sweep failed: ${err.message}`));
  });
  logger.info(`Slot hold sweep job scheduled: ${expr}`);
}

module.exports = { startSlotHoldSweepJob };
