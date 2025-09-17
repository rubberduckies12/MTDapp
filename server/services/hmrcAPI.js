const { Pool } = require('pg');
const axios = require('axios');

const pool = new Pool();

// Helper: Get HMRC tokens for a user
async function getTokens(userId) {
  const result = await pool.query(
    'SELECT access_token, refresh_token, expires_at FROM hmrc_tokens WHERE user_id = $1',
    [userId]
  );
  return result.rows[0];
}

// Helper: Refresh HMRC access token
async function refreshToken(userId) {
  const tokens = await getTokens(userId);
  const response = await axios.post('https://test-api.service.hmrc.gov.uk/oauth/token', null, {
    params: {
      client_id: process.env.HMRC_CLIENT_ID,
      client_secret: process.env.HMRC_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
    },
  });

  const { access_token, refresh_token, expires_in } = response.data;
  await pool.query(
    `UPDATE hmrc_tokens SET access_token = $1, refresh_token = $2, expires_at = now() + interval '${expires_in} seconds', updated_at = now() WHERE user_id = $3`,
    [access_token, refresh_token, userId]
  );
  return access_token;
}

// Helper: Make authenticated HMRC API request
async function hmrcRequest(userId, method, url, data = null) {
  let tokens = await getTokens(userId);
  let accessToken = tokens.access_token;

  // Refresh token if expired
  if (new Date(tokens.expires_at) < new Date()) {
    accessToken = await refreshToken(userId);
  }

  try {
    const response = await axios({
      method,
      url,
      data,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.hmrc.1.0+json',
        'Content-Type': 'application/json',
        'Gov-Client-Connection-Method': 'WEB_APP_VIA_SERVER',
      },
    });
    return response.data;
  } catch (err) {
    throw err;
  }
}

// Submit MTD payload (quarterly, EOPS, final declaration)
async function submit(payload, userId) {
  try {
    // Example endpoint: replace with correct HMRC endpoint for your submission type
    const url = 'https://test-api.service.hmrc.gov.uk/organisations/self-assessment/submit';
    const response = await hmrcRequest(userId, 'POST', url, payload);

    // Log success in submissions table
    await pool.query(
      `UPDATE submissions SET hmrc_response = $1, status = 'accepted', submitted_at = now(), updated_at = now()
       WHERE user_id = $2 AND payload = $3`,
      [response, userId, payload]
    );

    return response;
  } catch (err) {
    // Log failure in submissions table
    await pool.query(
      `UPDATE submissions SET hmrc_response = $1, status = 'failed', updated_at = now()
       WHERE user_id = $2 AND payload = $3`,
      [err.response?.data || { error: err.message }, userId, payload]
    );
    throw err;
  }
}

module.exports = {
  getTokens,
  refreshToken,
  hmrcRequest,
  submit,
};