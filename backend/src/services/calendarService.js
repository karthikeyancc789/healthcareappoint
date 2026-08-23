const { google } = require('googleapis');
const logger = require('../config/logger');
const prisma = require('../config/prisma');

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

function getAuthUrl(userId) {
  const oAuth2Client = getOAuthClient();
  return oAuth2Client.generateAuthUrl({
    access_type: 'offline', // required to receive a refresh_token
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar.events'],
    state: userId, // so the callback knows which user to attach tokens to
  });
}

/** Exchanges an OAuth code for tokens and stores them on the user. */
async function handleOAuthCallback(code, userId) {
  const oAuth2Client = getOAuthClient();
  const { tokens } = await oAuth2Client.getToken(code);

  await prisma.user.update({
    where: { id: userId },
    data: {
      googleAccessToken: tokens.access_token,
      googleRefreshToken: tokens.refresh_token || undefined, // only present on first consent
      googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    },
  });
}

/** Builds an authenticated client for a specific user, refreshing if needed. */
async function getClientForUser(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.googleRefreshToken) return null; // user never connected calendar

  const oAuth2Client = getOAuthClient();
  oAuth2Client.setCredentials({
    access_token: user.googleAccessToken,
    refresh_token: user.googleRefreshToken,
  });
  return oAuth2Client;
}

/**
 * Creates a calendar event for a single user. Returns the created event id,
 * or null if the user hasn't connected calendar or the call fails — calendar
 * sync is treated as best-effort and must never block the booking flow.
 */
async function createEvent(userId, { summary, description, startTime, endTime }) {
  try {
    const authClient = await getClientForUser(userId);
    if (!authClient) return null;

    const calendar = google.calendar({ version: 'v3', auth: authClient });
    const event = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary,
        description,
        start: { dateTime: startTime },
        end: { dateTime: endTime },
        reminders: { useDefault: true },
      },
    });
    return event.data.id;
  } catch (err) {
    logger.error(`Calendar createEvent failed for user ${userId}: ${err.message}`);
    return null;
  }
}

async function updateEvent(userId, eventId, { summary, description, startTime, endTime }) {
  if (!eventId) return false;
  try {
    const authClient = await getClientForUser(userId);
    if (!authClient) return false;
    const calendar = google.calendar({ version: 'v3', auth: authClient });
    await calendar.events.update({
      calendarId: 'primary',
      eventId,
      requestBody: {
        summary,
        description,
        start: { dateTime: startTime },
        end: { dateTime: endTime },
      },
    });
    return true;
  } catch (err) {
    logger.error(`Calendar updateEvent failed for user ${userId}, event ${eventId}: ${err.message}`);
    return false;
  }
}

async function deleteEvent(userId, eventId) {
  if (!eventId) return false;
  try {
    const authClient = await getClientForUser(userId);
    if (!authClient) return false;
    const calendar = google.calendar({ version: 'v3', auth: authClient });
    await calendar.events.delete({ calendarId: 'primary', eventId });
    return true;
  } catch (err) {
    logger.error(`Calendar deleteEvent failed for user ${userId}, event ${eventId}: ${err.message}`);
    return false;
  }
}

module.exports = { getAuthUrl, handleOAuthCallback, createEvent, updateEvent, deleteEvent };
