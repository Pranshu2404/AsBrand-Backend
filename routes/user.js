const express = require('express');
const asyncHandler = require('express-async-handler');
const jwt = require('jsonwebtoken');
const router = express.Router();
const User = require('../model/user');
const { authMiddleware, adminMiddleware } = require('../middleware/auth.middleware.js');
const { validate } = require('../middleware/validate');
const { registerSchema, loginSchema } = require('../validators/schemas');

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
// REGISTER - Public route
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
  await user.save();
  // Generate token
  const token = generateToken(user);
  res.status(201).json({
    success: true,
    message: 'Registration successful.',
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role
      },
      token
    }
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
  // Generate token
  const token = generateToken(user);
  res.json({
    success: true,
    message: 'Login successful.',
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role
      },
      token
    }
  });
}));
// GET PROFILE - Protected route
router.get('/profile', authMiddleware, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');
  res.json({ success: true, data: user });
}));
// GET ALL USERS - Admin only
router.get('/', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const users = await User.find().select('-password');
  res.json({ success: true, data: users });
}));
module.exports = router;
