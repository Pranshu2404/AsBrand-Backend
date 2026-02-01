const express = require('express');
const asyncHandler = require('express-async-handler');
const router = express.Router();
const dotenv = require('dotenv');
dotenv.config();

const { authMiddleware } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate');
const { stripePaymentSchema } = require('../validators/schemas');

const {
  initiateOrder,
  verifyPayment,
  placeCodOrder,
  handlePaymentFailure
} = require('../controllers/paymentController');

// ==========================================
// RAZORPAY PAYMENT ROUTES (PRIMARY)
// ==========================================

/**
 * @route POST /payment/initiate
 * @desc Create order in DB + Razorpay, return razorpay_order_id
 * @access Private (requires auth)
 */
router.post('/initiate', authMiddleware, asyncHandler(initiateOrder));

/**
 * @route POST /payment/verify
 * @desc Verify Razorpay signature after payment success
 * @access Private (requires auth)
 */
router.post('/verify', authMiddleware, asyncHandler(verifyPayment));

/**
 * @route POST /payment/cod
 * @desc Place Cash on Delivery order
 * @access Private (requires auth)
 */
router.post('/cod', authMiddleware, asyncHandler(placeCodOrder));

/**
 * @route POST /payment/failure
 * @desc Record payment failure
 * @access Private (requires auth)
 */
router.post('/failure', authMiddleware, asyncHandler(handlePaymentFailure));

/**
 * @route GET /payment/razorpay-key
 * @desc Get Razorpay public key for frontend
 * @access Public
 */
router.get('/razorpay-key', (req, res) => {
  res.json({
    success: true,
    data: { key: process.env.RAZORPAY_KEY_ID }
  });
});

// ==========================================
// STRIPE PAYMENT ROUTES (BACKUP/ALTERNATIVE)
// ==========================================

const stripe = require('stripe')(process.env.STRIPE_SKRT_KET_TST);

router.post('/stripe', validate(stripePaymentSchema), asyncHandler(async (req, res) => {
  try {
    const { email, name, address, amount, currency, description } = req.body;

    const customer = await stripe.customers.create({
      email: email,
      name: name,
      address: address,
    });

    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customer.id },
      { apiVersion: '2023-10-16' }
    );

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: currency,
      customer: customer.id,
      description: description,
      automatic_payment_methods: {
        enabled: true,
      },
    });

    res.json({
      success: true,
      message: "Payment intent created successfully.",
      data: {
        paymentIntent: paymentIntent.client_secret,
        ephemeralKey: ephemeralKey.secret,
        customer: customer.id,
        publishableKey: process.env.STRIPE_PBLK_KET_TST,
      }
    });

  } catch (error) {
    console.log(error);
    return res.json({ error: true, message: error.message, data: null });
  }
}));

// Legacy Razorpay key endpoint
router.post('/razorpay', asyncHandler(async (req, res) => {
  try {
    const razorpayKey = process.env.RAZORPAY_KEY_ID;
    res.json({
      success: true,
      message: "Razorpay key retrieved successfully.",
      data: { key: razorpayKey }
    });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ error: true, message: error.message, data: null });
  }
}));

module.exports = router;