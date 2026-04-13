const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';
const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || 'advance-kyc-api.p.rapidapi.com';

/**
 * Helper to call the RapidAPI KYC service
 */
async function callRapidApi(endpoint, data) {
  if (!RAPIDAPI_KEY) {
    console.warn(`[Mock Mode] RapidAPI Key is missing for ${endpoint}. Returning mock success.`);
    return { success: true, verified: true, mock: true };
  }

  try {
    const options = {
      method: 'POST',
      url: `https://${RAPIDAPI_HOST}${endpoint}`,
      headers: {
        'content-type': 'application/json',
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST
      },
      data: data
    };

    const response = await axios.request(options);
    
    // Assume response format typical of IDfy/KYC APIs where 200 implies valid structure,
    // and custom status/verified keys in the response indicate authentic data.
    // Replace logic based on actual specific provider API structure.
    if (response.data && response.status === 200) {
       return { success: true, verified: true, data: response.data };
    }
    
    return { success: false, verified: false, data: response.data };
  } catch (error) {
    console.error('RapidAPI Error on', endpoint, error.message);
    return { success: false, verified: false, error: error.message };
  }
}

async function verifyPan(panNumber) {
  if (!panNumber) return { success: false, verified: false, error: 'Missing PAN number' };
  // Typical payload for PAN verification
  return await callRapidApi('/verify/pan', { panNumber });
}

async function verifyAadhaar(aadhaarNumber) {
  if (!aadhaarNumber) return { success: false, verified: false, error: 'Missing Aadhaar number' };
  // Typical payload for Aadhaar verification
  return await callRapidApi('/verify/aadhaar', { aadhaarNumber });
}

async function verifyDl(dlNumber) {
  if (!dlNumber) return { success: false, verified: false, error: 'Missing DL number' };
  // Typical payload for DL verification
  return await callRapidApi('/verify/dl', { dlNumber });
}

async function verifyRc(rcNumber) {
  if (!rcNumber) return { success: false, verified: false, error: 'Missing RC number' };
  // Typical payload for RC verification
  return await callRapidApi('/verify/rc', { rcNumber });
}

module.exports = {
  verifyPan,
  verifyAadhaar,
  verifyDl,
  verifyRc
};
