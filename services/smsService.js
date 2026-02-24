const axios = require('axios');

const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY;
const FAST2SMS_URL = 'https://www.fast2sms.com/dev/bulkV2';

/**
 * Send OTP via Fast2SMS
 * @param {string} phone - 10-digit Indian phone number
 * @param {string} otp - 6-digit OTP code
 * @returns {Promise<boolean>} - true if sent successfully
 */
async function sendOtpSms(phone, otp) {
    if (!FAST2SMS_API_KEY) {
        console.warn('⚠️  FAST2SMS_API_KEY not set. OTP logged to console only.');
        console.log(`\n📱 OTP for ${phone}: ${otp}\n`);
        return true;
    }

    try {
        const response = await axios.get(FAST2SMS_URL, {
            params: {
                authorization: FAST2SMS_API_KEY,
                route: 'otp',
                variables_values: otp,
                flash: 0,
                numbers: phone,
            },
            headers: {
                'cache-control': 'no-cache',
            },
        });

        console.log('Fast2SMS response:', JSON.stringify(response.data));

        if (response.data && response.data.return === true) {
            console.log(`✅ OTP sent to ${phone} via Fast2SMS`);
            return true;
        } else {
            console.error('❌ Fast2SMS error:', response.data?.message || response.data);
            // Don't throw — still let the flow continue so OTP is saved in DB
            return false;
        }
    } catch (error) {
        console.error('❌ Fast2SMS request failed:', error.response?.data || error.message);
        // Don't throw — let the flow continue, OTP is still saved in DB for dev testing
        console.log(`\n📱 [FALLBACK] OTP for ${phone}: ${otp}\n`);
        return false;
    }
}

module.exports = { sendOtpSms };
