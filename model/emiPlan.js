const mongoose = require('mongoose');
const emiPlanSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
    // e.g., "3 Month No-Cost EMI"
  },
  tenure: {
    type: Number,
    required: true
    // Number of months: 3, 6, 9, 12
  },
  interestRate: {
    type: Number,
    default: 0
    // 0 for no-cost EMI
  },
  processingFee: {
    type: Number,
    default: 0
  },
  minOrderAmount: {
    type: Number,
    required: true
    // Minimum cart value for this plan
  },
  maxOrderAmount: {
    type: Number
    // Optional maximum limit
  },
  isActive: {
    type: Boolean,
    default: true
  },
  applicableCategories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  }],
  bankPartners: [{
    bankName: String,
    cardType: { type: String, enum: ['credit', 'debit', 'both'] }
  }]
}, { timestamps: true });
// Method to calculate EMI
emiPlanSchema.methods.calculateEMI = function (principal) {
  const P = principal;
  const R = this.interestRate / 12 / 100; // Monthly interest rate
  const N = this.tenure;

  if (R === 0) {
    // No-cost EMI: simple division
    return Math.ceil(P / N);
  }

  // EMI Formula: P * R * (1+R)^N / ((1+R)^N - 1)
  const emi = P * R * Math.pow(1 + R, N) / (Math.pow(1 + R, N) - 1);
  return Math.ceil(emi);
};
module.exports = mongoose.model('EmiPlan', emiPlanSchema);
