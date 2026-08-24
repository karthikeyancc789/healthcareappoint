require('dotenv').config();

const app = require('./app');
const logger = require('./config/logger');

const { startReminderJob } = require('./jobs/reminderJob');
const { startEmailRetryJob } = require('./jobs/emailRetryJob');
const { startSlotHoldSweepJob } = require('./jobs/slotHoldSweepJob');

const PORT = process.env.PORT || 5003;

const server = app.listen(PORT, () => {
    logger.info(
        `Healthcare Appointment Manager API listening on port ${PORT}`
    );

    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);

    // Start background jobs
    startReminderJob();
    startEmailRetryJob();
    startSlotHoldSweepJob();
});

// Handle unexpected server errors
server.on('error', (error) => {
    logger.error(`Server error: ${error.message}`);
    console.error('Server failed to start:', error);
});