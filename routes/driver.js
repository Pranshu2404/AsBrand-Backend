const express = require('express');
const asyncHandler = require('express-async-handler');
const jwt = require('jsonwebtoken');
const router = express.Router();
const User = require('../model/user');
const Driver = require('../model/driver');
const Order = require('../model/order');
const { authMiddleware, driverMiddleware } = require('../middleware/auth.middleware');
const { sendOtpSms } = require('../services/smsService');
const { uploadDriverPhoto, uploadProofOfDelivery } = require('../uploadFile');

// ---------- Helper ----------
const generateToken = (user, driverId) => {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role, driverId },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
};

// =====================================================
// AUTH ROUTES (public)
// =====================================================

// POST /driver/send-otp
router.post('/send-otp', asyncHandler(async (req, res) => {
  const { phone } = req.body;
  if (!phone) {
    return res.status(400).json({ success: false, message: 'Phone number is required.' });
  }

  // Find or create a driver user
  let user = await User.findOne({ phone, role: 'driver' });
  if (!user) {
    // Auto-create a driver user account
    user = new User({
      name: 'Driver',
      email: `driver_${phone}@asbrand.com`,
      phone,
      password: 'driver_' + Math.random().toString(36).substring(2, 10),
      role: 'driver'
    });
    await user.save();
  }

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);
  user.otp = otp;
  user.otpExpiry = otpExpiry;
  await user.save();

  let smsSent = false;
  try {
    smsSent = await sendOtpSms(phone, otp);
  } catch (err) {
    console.error('SMS failed for driver:', err.message);
  }

  res.json({
    success: true,
    message: smsSent ? 'OTP sent to your phone.' : 'OTP generated.',
    dev_otp: otp
  });
}));

// POST /driver/verify-otp
router.post('/verify-otp', asyncHandler(async (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp) {
    return res.status(400).json({ success: false, message: 'Phone and OTP are required.' });
  }

  const user = await User.findOne({ phone, role: 'driver' });
  if (!user) {
    return res.status(404).json({ success: false, message: 'Driver account not found.' });
  }

  // Magic OTP for development
  if (otp === '000000') {
    // Bypass verification logic
  } else {
    if (!user.otp || !user.otpExpiry) {
      return res.status(400).json({ success: false, message: 'No OTP was requested.' });
    }
    if (new Date() > user.otpExpiry) {
      user.otp = null;
      user.otpExpiry = null;
      await user.save();
      return res.status(400).json({ success: false, message: 'OTP expired. Request a new one.' });
    }
    if (user.otp !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP.' });
    }
  }

  user.otp = null;
  user.otpExpiry = null;
  user.isVerified = true;
  await user.save();

  // Check if driver profile exists
  const driverProfile = await Driver.findOne({ userId: user._id });
  const token = generateToken(user, driverProfile?._id || null);

  res.json({
    success: true,
    message: 'Phone verified successfully.',
    data: {
      user: {
        id: user._id,
        phone: user.phone,
        role: user.role
      },
      isProfileComplete: driverProfile?.isProfileComplete || false,
      driverProfile: driverProfile || null,
      token
    }
  });
}));

// =====================================================
// PROFILE ROUTES (authenticated driver)
// =====================================================

// POST /driver/profile  (multipart — profilePhoto)
router.post('/profile', authMiddleware, driverMiddleware, uploadDriverPhoto.single('profilePhoto'), asyncHandler(async (req, res) => {
  const { fullName, vehicleType, vehicleNumber } = req.body;
  if (!fullName || !vehicleType || !vehicleNumber) {
    return res.status(400).json({ success: false, message: 'fullName, vehicleType and vehicleNumber are required.' });
  }

  const user = await User.findById(req.user.id);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  let driver = await Driver.findOne({ userId: user._id });
  if (driver) {
    // Update existing
    driver.fullName = fullName;
    driver.vehicleType = vehicleType;
    driver.vehicleNumber = vehicleNumber;
    if (req.file) driver.profilePhoto = req.file.path;
    driver.isProfileComplete = true;
    await driver.save();
  } else {
    // Create new
    driver = new Driver({
      userId: user._id,
      fullName,
      phone: user.phone,
      vehicleType,
      vehicleNumber,
      profilePhoto: req.file ? req.file.path : null,
      isProfileComplete: true
    });
    await driver.save();
  }

  // Update user name
  user.name = fullName;
  await user.save();

  const token = generateToken(user, driver._id);

  res.json({
    success: true,
    message: 'Driver profile saved.',
    data: { driver, token }
  });
}));

// GET /driver/profile
router.get('/profile', authMiddleware, driverMiddleware, asyncHandler(async (req, res) => {
  const driver = await Driver.findOne({ userId: req.user.id });
  if (!driver) {
    return res.status(404).json({ success: false, message: 'Driver profile not found.' });
  }
  res.json({ success: true, data: driver });
}));

// =====================================================
// ORDER ROUTES (authenticated driver)
// =====================================================

// GET /driver/orders  — orders assigned to this driver
router.get('/orders', authMiddleware, driverMiddleware, asyncHandler(async (req, res) => {
  const driver = await Driver.findOne({ userId: req.user.id });
  if (!driver) {
    return res.status(404).json({ success: false, message: 'Driver profile not found.' });
  }

  const orders = await Order.find({ assignedDriver: driver._id })
    .populate('userID', 'name phone')
    .sort({ _id: -1 });

  res.json({ success: true, message: 'Orders retrieved.', data: orders });
}));

// PATCH /driver/orders/:id/status
router.patch('/orders/:id/status', authMiddleware, driverMiddleware, asyncHandler(async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED'];
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }

  const order = await Order.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found.' });
  }

  order.deliveryStatus = status;
  if (status === 'DELIVERED') {
    order.orderStatus = 'delivered';
  }
  await order.save();

  res.json({ success: true, message: `Order status updated to ${status}.`, data: order });
}));

// POST /driver/orders/:id/proof  (multipart — proofImage)
router.post('/orders/:id/proof', authMiddleware, driverMiddleware, uploadProofOfDelivery.single('proofImage'), asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found.' });
  }

  if (req.file) {
    order.proofOfDelivery = req.file.path;
  }
  if (req.body.notes) {
    order.deliveryNotes = req.body.notes;
  }
  await order.save();

  res.json({ success: true, message: 'Proof of delivery uploaded.', data: order });
}));

module.exports = router;
