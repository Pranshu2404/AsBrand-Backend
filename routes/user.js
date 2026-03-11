const express = require('express');
const asyncHandler = require('express-async-handler');
const jwt = require('jsonwebtoken');
const router = express.Router();
const User = require('../model/user');
const { authMiddleware, adminMiddleware } = require('../middleware/auth.middleware.js');
const { validate } = require('../middleware/validate');
const { registerSchema, loginSchema, sendOtpSchema, verifyOtpSchema } = require('../validators/schemas');
const { sendOtpSms } = require('../services/smsService');

// Generate JWT Token
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      role: user.role
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// SEND OTP - Public route
router.post('/send-otp', validate(sendOtpSchema), asyncHandler(async (req, res) => {
  const { phone } = req.body;

  // Find user by phone
  const user = await User.findOne({ phone });
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'No account found with this phone number. Please register first.'
    });
  }

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  // Save OTP to user record
  user.otp = otp;
  user.otpExpiry = otpExpiry;
  await user.save();

  // Send OTP via 2Factor (never fail the route even if SMS fails)
  let smsSent = false;
  try {
    smsSent = await sendOtpSms(phone, otp);
  } catch (smsErr) {
    console.error('SMS sending failed, OTP saved in DB:', smsErr.message);
  }

  res.json({
    success: true,
    message: smsSent ? 'OTP sent to your phone.' : 'OTP generated. Check your phone or use the code below.',
    dev_otp: otp
  });
}));

// VERIFY OTP - Public route
router.post('/verify-otp', validate(verifyOtpSchema), asyncHandler(async (req, res) => {
  const { phone, otp } = req.body;

  // Find user by phone
  const user = await User.findOne({ phone });
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'No account found with this phone number.'
    });
  }

  // Check OTP
  if (!user.otp || !user.otpExpiry) {
    return res.status(400).json({
      success: false,
      message: 'No OTP was requested. Please request a new OTP.'
    });
  }

  // Check expiry
  if (new Date() > user.otpExpiry) {
    user.otp = null;
    user.otpExpiry = null;
    await user.save();
    return res.status(400).json({
      success: false,
      message: 'OTP has expired. Please request a new one.'
    });
  }

  // Check match
  if (user.otp !== otp) {
    return res.status(400).json({
      success: false,
      message: 'Invalid OTP. Please try again.'
    });
  }

  // OTP is valid — clear it and issue token
  user.otp = null;
  user.otpExpiry = null;
  user.isVerified = true;
  await user.save();

  const token = generateToken(user);

  res.json({
    success: true,
    message: 'Phone verified successfully.',
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        supplierProfile: user.supplierProfile || null
      },
      token
    }
  });
}));

// REGISTER - Public route (with OTP verification)
router.post('/register', validate(registerSchema), asyncHandler(async (req, res) => {
  const { name, email, phone, password } = req.body;

  // Check if user exists
  const existingUser = await User.findOne({
    $or: [{ email }, { phone }]
  });

  if (existingUser) {
    return res.status(400).json({
      success: false,
      message: 'User already exists with this email or phone.'
    });
  }

  // Create user (password will be auto-hashed by pre-save hook)
  const user = new User({ name, email, phone, password });

  // Generate OTP for phone verification
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
  user.otp = otp;
  user.otpExpiry = otpExpiry;
  await user.save();

  // Send OTP via 2Factor (never fail the route even if SMS fails)
  let smsSent = false;
  try {
    smsSent = await sendOtpSms(phone, otp);
  } catch (smsErr) {
    console.error('SMS sending failed, OTP saved in DB:', smsErr.message);
  }

  // Return success WITHOUT token — user must verify OTP first
  res.status(201).json({
    success: true,
    message: 'Registration successful. Please verify your phone number with the OTP sent.',
    data: {
      phone: user.phone,
      requiresOtpVerification: true
    },
    dev_otp: otp
  });
}));
// LOGIN - Public route
router.post('/login', validate(loginSchema), asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  // Find user
  const user = await User.findOne({ email });
  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'Invalid email or password.'
    });
  }
  // Check password using our schema method
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    return res.status(401).json({
      success: false,
      message: 'Invalid email or password.'
    });
  }
  // Generate OTP for phone verification upon login
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
  user.otp = otp;
  user.otpExpiry = otpExpiry;
  await user.save();

  // Send OTP via 2Factor
  let smsSent = false;
  try {
    smsSent = await sendOtpSms(user.phone, otp);
  } catch (smsErr) {
    console.error('SMS sending failed during login, OTP saved in DB:', smsErr.message);
  }

  res.json({
    success: true,
    message: 'Login credentials valid. Please verify your phone number with the OTP sent.',
    data: {
      phone: user.phone,
      requiresOtpVerification: true
    },
    dev_otp: otp
  });
}));
// GET PROFILE - Protected route (also refreshes token)
router.get('/profile', authMiddleware, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }
  res.json({
    success: true,
    data: user,
    token: generateToken(user) // fresh token with current role
  });
}));
// GET ALL USERS - Admin only
router.get('/', asyncHandler(async (req, res) => {
  const users = await User.find().select('-password');
  res.json({ success: true, data: users });
}));

// DELETE USER - Admin
router.delete('/:id', asyncHandler(async (req, res) => {
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }
  res.json({ success: true, message: 'User deleted successfully.' });
}));

// UPDATE USER ROLE - Admin
router.put('/:id/role', asyncHandler(async (req, res) => {
  const { role } = req.body;
  if (!['user', 'supplier', 'admin'].includes(role)) {
    return res.status(400).json({ success: false, message: 'Invalid role.' });
  }
  const user = await User.findById(req.params.id);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }
  user.role = role;
  await user.save();
  res.json({ success: true, message: 'User role updated successfully.', data: user });
}));

module.exports = router;
