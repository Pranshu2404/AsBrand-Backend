const mongoose = require('mongoose');
const installmentSchema = new mongoose.Schema({
  installmentNumber: Number,
  dueDate: Date,
  amount: Number,
  status: {
    type: String,
    enum: ['pending', 'paid', 'overdue', 'failed'],
    default: 'pending'
  },
  paidDate: Date,
  transactionId: String,
  paymentMethod: String
});
const emiApplicationSchema = new mongoose.Schema({
  // References
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  emiPlanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EmiPlan',
    required: true
  },

  // EMI Details
  principalAmount: {
    type: Number,
    required: true
  },
  totalInterest: {
    type: Number,
    default: 0
  },
  processingFee: {
    type: Number,
    default: 0
  },
  totalAmount: {
    type: Number,
    required: true
  },
  tenure: {
    type: Number,
    required: true
  },
  monthlyEmi: {
    type: Number,
    required: true
  },

  // Status Tracking
  status: {
    type: String,
    enum: [
      'pending',      // Initial state
      'approved',     // KYC passed, credit check passed
      'rejected',     // Failed verification
      'active',       // EMI disbursed, payments ongoing
      'completed',    // All installments paid
      'defaulted'     // Multiple missed payments
    ],
    default: 'pending'
  },

  // Installment Schedule
  installments: [installmentSchema],

  // Payment Summary
  paidInstallments: { type: Number, default: 0 },
  remainingInstallments: Number,
  nextDueDate: Date,

  // Timestamps
  approvedAt: Date,
  disbursedAt: Date,
  completedAt: Date
}, { timestamps: true });
// Generate installment schedule
emiApplicationSchema.methods.generateSchedule = function () {
  const installments = [];
  const startDate = new Date();

  for (let i = 1; i <= this.tenure; i++) {
    const dueDate = new Date(startDate);
    dueDate.setMonth(dueDate.getMonth() + i);
    dueDate.setDate(5); // Due on 5th of each month

    installments.push({
      installmentNumber: i,
      dueDate: dueDate,
      amount: this.monthlyEmi,
      status: 'pending'
    });
  }

  this.installments = installments;
  this.remainingInstallments = this.tenure;
  this.nextDueDate = installments[0].dueDate;

  return installments;
};
module.exports = mongoose.model('EmiApplication', emiApplicationSchema);
