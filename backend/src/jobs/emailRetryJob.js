const cron = require('node-cron');
const prisma = require('../config/prisma');
const logger = require('../config/logger');
const emailService = require('../services/emailService');

const MAX_ATTEMPTS = 5;

/**
 * Retries any FAILED email notification, capped at MAX_ATTEMPTS. Uses a
 * simple attempts-based backoff (skip if last attempt was too recent) so a
 * persistently broken SMTP config doesn't hammer the provider every 2 minutes.
 */
async function runEmailRetrySweep() {
  const failed = await prisma.notification.findMany({
    where: { channel: 'EMAIL', status: 'FAILED', attempts: { lt: MAX_ATTEMPTS } },
    take: 100,
  });

  let retried = 0;
  for (const n of failed) {
    const backoffMs = Math.min(2 ** n.attempts, 60) * 60000; // cap at 60 min
    const dueSince = Date.now() - new Date(n.updatedAt).getTime();
    if (dueSince < backoffMs) continue;

    await prisma.notification.update({ where: { id: n.id }, data: { status: 'RETRYING' } });
    await emailService.attemptSend(n);
    retried++;
  }

  // Anything that has exhausted retries is left as FAILED for manual review
  // (visible via the notifications table / an admin dashboard query) rather
  // than being retried forever.
  if (retried) logger.info(`Email retry sweep: retried ${retried} notification(s)`);
}

function startEmailRetryJob() {
  const expr = process.env.EMAIL_RETRY_JOB_CRON || '*/2 * * * *';
  cron.schedule(expr, () => {
    runEmailRetrySweep().catch((err) => logger.error(`Email retry sweep failed: ${err.message}`));
  });
  logger.info(`Email retry job scheduled: ${expr}`);
}

module.exports = { startEmailRetryJob, runEmailRetrySweep };
