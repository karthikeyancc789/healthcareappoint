require('dotenv').config();
require('express-async-errors'); // must be required before routes are mounted

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const patientRoutes = require('./routes/patientRoutes');
const doctorRoutes = require('./routes/doctorRoutes');
const calendarRoutes = require('./routes/calendarRoutes');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

// In development, Vite may land on a different port than 5173 if it's
// already taken (5174, 5175, ...), which would otherwise break CORS every
// time. Allow any localhost/127.0.0.1 origin in dev; stay strict to
// FRONTEND_URL in production.
const corsOrigin =
    process.env.NODE_ENV === 'production'
        ? process.env.FRONTEND_URL
        : (origin, callback) => {
            if (!origin || https ?: \/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
                return callback(null, true);
            }
            callback(new Error(`Not allowed by CORS: ${origin}`));
        };

app.use(helmet());
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 })); // basic abuse protection

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/patient', patientRoutes);
app.use('/api/doctor', doctorRoutes);
app.use('/api/calendar', calendarRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Must be registered last — see middleware/errorHandler.js
app.use(errorHandler);

module.exports = app;