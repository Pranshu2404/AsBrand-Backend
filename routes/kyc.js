const express = require('express');
const asyncHandler = require('express-async-handler');
const router = express.Router();
const UserKyc = require('../model/userKyc');
const { authMiddleware, adminMiddleware } = require('../middleware/auth.middleware.js');

// Submit KYC
router.post('/submit', authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // Check if KYC already exists
  let kyc = await UserKyc.findOne({ userId });

  if (kyc && kyc.verificationStatus === 'verified') {
    return res.status(400).json({
      success: false,
      message: 'KYC already verified.'
    });
  }

  const kycData = {
    userId,
    ...req.body,
    verificationStatus: 'under_review'
  };

  if (kyc) {
    // Update existing
    Object.assign(kyc, kycData);
  } else {
    // Create new
    kyc = new UserKyc(kycData);
  }

  await kyc.save();

  res.json({
    success: true,
    message: 'KYC submitted for review.',
    data: kyc
  });
}));
// Get my KYC status
router.get('/status', authMiddleware, asyncHandler(async (req, res) => {
  const kyc = await UserKyc.findOne({ userId: req.user.id });

  res.json({
    success: true,
    data: kyc || { verificationStatus: 'not_submitted' }
  });
}));
// Admin: Get all pending KYC
router.get('/pending', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const pendingKyc = await UserKyc.find({
    verificationStatus: 'under_review'
  }).populate('userId', 'name email phone');

  res.json({ success: true, data: pendingKyc });
}));
// Admin: Approve/Reject KYC
router.put('/verify/:kycId', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { status, creditLimit, rejectionReason } = req.body;

  const kyc = await UserKyc.findById(req.params.kycId);

  if (!kyc) {
    return res.status(404).json({
      success: false,
      message: 'KYC not found.'
    });
  }

  kyc.verificationStatus = status; // 'verified' or 'rejected'

  if (status === 'verified') {
    kyc.verifiedAt = new Date();
    kyc.creditLimit = creditLimit || 50000; // Default limit
    kyc.creditScore = 700; // Mock score
  } else {
    kyc.rejectionReason = rejectionReason;
  }

  await kyc.save();

  res.json({
    success: true,
    message: `KYC ${status}`,
    data: kyc
  });
}));
module.exports = router;
