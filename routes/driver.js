const express = require('express');
const asyncHandler = require('express-async-handler');
const jwt = require('jsonwebtoken');
const router = express.Router();
const User = require('../model/user');
const Driver = require('../model/driver');
const Order = require('../model/order');
const Setting = require('../model/setting');
const DriverWithdrawal = require('../model/driverWithdrawal');
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

// GET /driver/orders/:id/details — full order details with supplier coordinates for navigation
router.get('/orders/:id/details', authMiddleware, driverMiddleware, asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate('userID', 'name phone');
  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found.' });
  }

  // Get supplier info
  const supplierId = order.items?.[0]?.supplierId;
  let supplierInfo = null;
  if (supplierId) {
    const User = require('../model/user');
    const supplier = await User.findById(supplierId);
    if (supplier?.supplierProfile) {
      supplierInfo = {
        storeName: supplier.supplierProfile.storeName,
        address: supplier.supplierProfile.pickupAddress?.street || supplier.supplierProfile.pickupAddress?.address || '',
        latitude: supplier.supplierProfile.pickupAddress?.latitude,
        longitude: supplier.supplierProfile.pickupAddress?.longitude,
        phone: supplier.phone,
      };
    }
  }

  res.json({
    success: true,
    data: {
      order,
      supplier: supplierInfo,
    }
  });
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

    // Calculate and credit driver earnings
    try {
      const driver = await Driver.findOne({ userId: req.user.id });
      if (driver) {
        const settings = await Setting.findOne() || {};
        const pickupFreeKm = settings.driverPickupFreeKm || 1;
        const pickupRate = settings.driverPickupRatePerKm || 3;
        const dropRate = settings.driverDropRatePerKm || 12;

        // Get supplier location for pickup distance
        const supplierId = order.items?.[0]?.supplierId;
        const supplier = supplierId ? await User.findById(supplierId) : null;
        const pickupLat = supplier?.supplierProfile?.pickupAddress?.latitude;
        const pickupLng = supplier?.supplierProfile?.pickupAddress?.longitude;
        const customerLat = order.shippingAddress?.latitude;
        const customerLng = order.shippingAddress?.longitude;
        const driverLat = driver.currentLocation?.lat || 0;
        const driverLng = driver.currentLocation?.lng || 0;

        // Haversine distance calculation
        function haversineKm(lat1, lon1, lat2, lon2) {
          const R = 6371;
          const dLat = (lat2 - lat1) * Math.PI / 180;
          const dLon = (lon2 - lon1) * Math.PI / 180;
          const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
          return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        }

        let pickupDistKm = 0;
        let dropDistKm = 0;
        if (pickupLat && pickupLng) {
          pickupDistKm = haversineKm(driverLat, driverLng, pickupLat, pickupLng);
        }
        if (pickupLat && pickupLng && customerLat && customerLng) {
          dropDistKm = haversineKm(pickupLat, pickupLng, customerLat, customerLng);
        }

        const pickupEarnings = pickupDistKm > pickupFreeKm
          ? (pickupDistKm - pickupFreeKm) * pickupRate
          : 0;
        const dropEarnings = dropDistKm * dropRate;
        const totalDriverEarnings = Math.round(pickupEarnings + dropEarnings);

        // Credit to driver wallet
        driver.walletBalance = (driver.walletBalance || 0) + totalDriverEarnings;
        driver.totalEarnings = (driver.totalEarnings || 0) + totalDriverEarnings;
        await driver.save();

        // Save earnings on the order
        order.driverEarnings = totalDriverEarnings;
      }
    } catch (err) {
      console.error('Error calculating driver earnings:', err);
    }
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

// =====================================================
// DRIVER STATUS (authenticated driver)
// =====================================================

// PATCH /driver/status — toggle online/offline + update location
router.patch('/status', authMiddleware, driverMiddleware, asyncHandler(async (req, res) => {
  const { isOnline, lat, lng } = req.body;
  const driver = await Driver.findOne({ userId: req.user.id });
  if (!driver) {
    return res.status(404).json({ success: false, message: 'Driver profile not found.' });
  }

  if (typeof isOnline === 'boolean') {
    driver.isOnline = isOnline;
  }
  if (lat !== undefined && lng !== undefined) {
    driver.currentLocation = { lat, lng, updatedAt: new Date() };
  }
  await driver.save();

  res.json({ success: true, message: `Driver is now ${driver.isOnline ? 'ONLINE' : 'OFFLINE'}.`, data: driver });
}));

// =====================================================
// ORDER ACCEPT / REJECT (authenticated driver)
// =====================================================

// POST /driver/orders/:id/accept — accept an order notification
router.post('/orders/:id/accept', authMiddleware, driverMiddleware, asyncHandler(async (req, res) => {
  const driver = await Driver.findOne({ userId: req.user.id });
  if (!driver) {
    return res.status(404).json({ success: false, message: 'Driver profile not found.' });
  }

  const order = await Order.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found.' });
  }

  // Check if already assigned
  if (order.assignedDriver && order.assignedDriver.toString() !== driver._id.toString()) {
    return res.status(400).json({ success: false, message: 'Order already assigned to another driver.' });
  }

  order.assignedDriver = driver._id;
  order.deliveryStatus = 'PICKED_UP';
  await order.save();

  res.json({ success: true, message: 'Order accepted.', data: order });
}));

// POST /driver/orders/:id/reject — reject an order notification (cascades to next driver)
router.post('/orders/:id/reject', authMiddleware, driverMiddleware, asyncHandler(async (req, res) => {
  // Simply acknowledge the rejection — the cascading logic will be handled
  // by the Socket.io event system which notifies the next nearest driver
  res.json({ success: true, message: 'Order rejected. Notifying next available driver.' });
}));

// =====================================================
// WALLET & BANK DETAILS (authenticated driver)
// =====================================================

// GET /driver/wallet
router.get('/wallet', authMiddleware, driverMiddleware, asyncHandler(async (req, res) => {
  const driver = await Driver.findOne({ userId: req.user.id });
  if (!driver) {
    return res.status(404).json({ success: false, message: 'Driver profile not found.' });
  }

  // Fetch recent earnings (delivered orders assigned to this driver)
  const earnings = await Order.find({ 
    assignedDriver: driver._id,
    deliveryStatus: 'DELIVERED'
  }).select('_id totalPrice driverEarnings orderDate deliveryStatus items shippingAddress').sort({ _id: -1 });

  // Fetch withdrawal history
  const withdrawals = await DriverWithdrawal.find({ driverId: driver._id }).sort({ createdAt: -1 });

  // Get min withdrawal amount from settings
  const settings = await Setting.findOne() || {};
  const minWithdrawalAmount = settings.minWithdrawalAmount || 100;
  const razorpayFeePercent = settings.razorpayFeePercent || 2;

  res.json({ 
    success: true, 
    data: {
      walletBalance: driver.walletBalance || 0,
      totalEarnings: driver.totalEarnings || 0,
      bankDetails: driver.bankDetails || null,
      minWithdrawalAmount,
      razorpayFeePercent,
      earningsHistory: earnings,
      withdrawalHistory: withdrawals
    } 
  });
}));

// POST /driver/bank-details
router.post('/bank-details', authMiddleware, driverMiddleware, asyncHandler(async (req, res) => {
  const { accountName, accountNumber, ifscCode, bankName } = req.body;
  if (!accountName || !accountNumber || !ifscCode || !bankName) {
    return res.status(400).json({ success: false, message: 'All bank details are required.' });
  }

  const driver = await Driver.findOne({ userId: req.user.id });
  if (!driver) {
    return res.status(404).json({ success: false, message: 'Driver profile not found.' });
  }

  driver.bankDetails = { accountName, accountNumber, ifscCode, bankName };
  await driver.save();

  res.json({ success: true, message: 'Bank details saved successfully.', data: driver });
}));

// =====================================================
// WITHDRAWAL (authenticated driver)
// =====================================================

// POST /driver/withdraw
router.post('/withdraw', authMiddleware, driverMiddleware, asyncHandler(async (req, res) => {
  const driver = await Driver.findOne({ userId: req.user.id });
  if (!driver) {
    return res.status(404).json({ success: false, message: 'Driver profile not found.' });
  }

  // Verify bank details exist
  if (!driver.bankDetails || !driver.bankDetails.accountNumber) {
    return res.status(400).json({ success: false, message: 'Please add bank details before withdrawing.' });
  }

  const settings = await Setting.findOne() || {};
  const minWithdrawalAmount = settings.minWithdrawalAmount || 100;
  const razorpayFeePercent = settings.razorpayFeePercent || 2;

  const { amount } = req.body;
  const withdrawAmount = parseFloat(amount);

  if (!withdrawAmount || withdrawAmount <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid withdrawal amount.' });
  }

  if (withdrawAmount < minWithdrawalAmount) {
    return res.status(400).json({ success: false, message: `Minimum withdrawal amount is ₹${minWithdrawalAmount}.` });
  }

  if (driver.walletBalance < withdrawAmount) {
    return res.status(400).json({ success: false, message: 'Insufficient wallet balance.' });
  }

  // Check for pending withdrawals
  const pendingWithdrawal = await DriverWithdrawal.findOne({
    driverId: driver._id,
    status: { $in: ['pending', 'processing'] }
  });
  if (pendingWithdrawal) {
    return res.status(400).json({ success: false, message: 'You already have a pending withdrawal request.' });
  }

  // Calculate fee
  const razorpayFee = Math.round(withdrawAmount * razorpayFeePercent / 100);
  const netAmount = withdrawAmount - razorpayFee;

  // Deduct from wallet
  driver.walletBalance -= withdrawAmount;
  await driver.save();

  // Create withdrawal record
  const withdrawal = new DriverWithdrawal({
    driverId: driver._id,
    amount: withdrawAmount,
    razorpayFee,
    netAmount,
    status: 'pending',
    bankDetails: { ...driver.bankDetails.toObject() }
  });
  await withdrawal.save();

  res.json({
    success: true,
    message: `Withdrawal request submitted. ₹${netAmount} will be transferred to your bank account.`,
    data: {
      withdrawalId: withdrawal._id,
      amount: withdrawAmount,
      razorpayFee,
      netAmount,
      status: 'pending',
      walletBalance: driver.walletBalance
    }
  });
}));

// GET /driver/withdrawals
router.get('/withdrawals', authMiddleware, driverMiddleware, asyncHandler(async (req, res) => {
  const driver = await Driver.findOne({ userId: req.user.id });
  if (!driver) {
    return res.status(404).json({ success: false, message: 'Driver profile not found.' });
  }

  const withdrawals = await DriverWithdrawal.find({ driverId: driver._id }).sort({ createdAt: -1 });
  res.json({ success: true, data: withdrawals });
}));

module.exports = router;
