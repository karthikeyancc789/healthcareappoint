const calendarService = require('../services/calendarService');
const { AppError } = require('../middleware/errorHandler');

/** Returns the Google consent URL for the logged-in user to connect their calendar. */
function connect(req, res) {
  const url = calendarService.getAuthUrl(req.user.id);
  res.json({ url });
}

/** OAuth redirect target. Exchanges the code for tokens and stores them. */
async function callback(req, res) {
  const { code, state } = req.query; // state carries the userId set in getAuthUrl
  if (!code || !state) throw new AppError('Missing code or state from Google OAuth redirect');

  await calendarService.handleOAuthCallback(code, state);
  res.redirect(`${process.env.FRONTEND_URL}/settings?calendar=connected`);
}

module.exports = { connect, callback };
