require('dotenv').config();
const app = require('./app');
const logger = require('./config/logger');
const { startReminderJob } = require('./jobs/reminderJob');
const { startEmailRetryJob } = require('./jobs/emailRetryJob');
const { startSlotHoldSweepJob } = require('./jobs/slotHoldSweepJob');

const PORT = process.env.PORT || 5003;

app.listen(PORT, () => {
  logger.info(`Healthcare Appointment Manager API listening on port ${PORT}`);

  // Background jobs run in-process via node-cron. For a heavier production
  // deployment these could be split into a separate worker process/service,
  // but in-process is sufficient for this project's scale and keeps
  // deployment to a single free-tier service.
  startReminderJob();
  startEmailRetryJob();
  startSlotHoldSweepJob();
});
