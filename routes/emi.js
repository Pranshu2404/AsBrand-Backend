const express = require('express');
const asyncHandler = require('express-async-handler');
const router = express.Router();
const EmiPlan = require('../model/emiPlan');
const EmiApplication = require('../model/emiApplication');
const UserKyc = require('../model/userKyc');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

//Emi plans staring yaha se


// Get all active EMI plans (Public)
router.get('/plans', asyncHandler(async (req, res) => {
  const { amount } = req.query;

  let query = { isActive: true };

  // Filter by order amount if provided
  if (amount) {
    query.minOrderAmount = { $lte: Number(amount) };
    query.$or = [
      { maxOrderAmount: { $gte: Number(amount) } },
      { maxOrderAmount: null }
    ];
  }

  const plans = await EmiPlan.find(query);

  // Calculate EMI for each plan if amount provided
  const plansWithEmi = plans.map(plan => ({
    ...plan.toObject(),
    calculatedEmi: amount ? plan.calculateEMI(Number(amount)) : null
  }));

  res.json({ success: true, data: plansWithEmi });
}));
// Create EMI Plan (Admin only)
router.post('/plans', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const plan = new EmiPlan(req.body);
  await plan.save();
  res.status(201).json({ success: true, data: plan });
}));
// ==================== EMI APPLICATIONS ====================
// Apply for EMI
router.post('/apply', authMiddleware, asyncHandler(async (req, res) => {
  const { orderId, emiPlanId, principalAmount } = req.body;
  const userId = req.user.id;

  // Check if user has completed KYC
  const kyc = await UserKyc.findOne({ userId });
  if (!kyc || kyc.verificationStatus !== 'verified') {
    return res.status(400).json({
      success: false,
      message: 'Please complete KYC verification first.'
    });
  }

  // Check credit limit
  if (principalAmount > kyc.creditLimit) {
    return res.status(400).json({
      success: false,
      message: `EMI amount exceeds your credit limit of ₹${kyc.creditLimit}`
    });
  }

  // Get EMI plan
  const plan = await EmiPlan.findById(emiPlanId);
  if (!plan) {
    return res.status(404).json({
      success: false,
      message: 'EMI plan not found.'
    });
  }

  // Calculate EMI details
  const monthlyEmi = plan.calculateEMI(principalAmount);
  const totalAmount = monthlyEmi * plan.tenure;
  const totalInterest = totalAmount - principalAmount;

  // Create application
  const application = new EmiApplication({
    userId,
    orderId,
    emiPlanId,
    principalAmount,
    totalInterest,
    processingFee: plan.processingFee,
    totalAmount: totalAmount + plan.processingFee,
    tenure: plan.tenure,
    monthlyEmi,
    status: 'approved' // Auto-approve for verified users
  });

  // Generate installment schedule
  application.generateSchedule();
  application.approvedAt = new Date();

  await application.save();

  res.status(201).json({
    success: true,
    message: 'EMI application approved!',
    data: application
  });
}));
// Get user's EMI applications
router.get('/my-applications', authMiddleware, asyncHandler(async (req, res) => {
  const applications = await EmiApplication.find({ userId: req.user.id })
    .populate('orderId')
    .populate('emiPlanId')
    .sort({ createdAt: -1 });

  res.json({ success: true, data: applications });
}));
// Pay an installment
router.post('/pay/:applicationId/:installmentNumber', authMiddleware, asyncHandler(async (req, res) => {
  const { applicationId, installmentNumber } = req.params;
  const { transactionId, paymentMethod } = req.body;

  const application = await EmiApplication.findOne({
    _id: applicationId,
    userId: req.user.id
  });

  if (!application) {
    return res.status(404).json({
      success: false,
      message: 'EMI application not found.'
    });
  }

  // Find the installment
  const installment = application.installments.find(
    i => i.installmentNumber === Number(installmentNumber)
  );

  if (!installment) {
    return res.status(404).json({
      success: false,
      message: 'Installment not found.'
    });
  }

  if (installment.status === 'paid') {
    return res.status(400).json({
      success: false,
      message: 'Installment already paid.'
    });
  }

  // Update installment
  installment.status = 'paid';
  installment.paidDate = new Date();
  installment.transactionId = transactionId;
  installment.paymentMethod = paymentMethod;

  // Update application summary
  application.paidInstallments += 1;
  application.remainingInstallments -= 1;

  // Find next due date
  const nextPending = application.installments.find(i => i.status === 'pending');
  application.nextDueDate = nextPending ? nextPending.dueDate : null;

  // Check if completed
  if (application.remainingInstallments === 0) {
    application.status = 'completed';
    application.completedAt = new Date();
  }

  await application.save();

  res.json({
    success: true,
    message: 'Installment paid successfully!',
    data: application
  });
}));
module.exports = router;
