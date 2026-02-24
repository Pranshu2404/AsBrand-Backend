const axios = require('axios');

const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY;
const FAST2SMS_URL = 'https://www.fast2sms.com/dev/bulkV2';

/**
 * Send OTP via Fast2SMS
 * Uses the DLT (OTP) route for automatic OTP delivery
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
        const response = await axios.post(FAST2SMS_URL, null, {
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

        if (response.data && response.data.return === true) {
            console.log(`✅ OTP sent to ${phone} via Fast2SMS`);
            return true;
        } else {
            console.error('❌ Fast2SMS error:', response.data?.message || response.data);
            return false;
        }
    } catch (error) {
        console.error('❌ Fast2SMS request failed:', error.response?.data || error.message);
        throw new Error('Failed to send OTP. Please try again.');
    }
}

module.exports = { sendOtpSms };
