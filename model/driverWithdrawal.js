const mongoose = require('mongoose');

const driverWithdrawalSchema = new mongoose.Schema({
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver',
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  razorpayFee: {
    type: Number,
    required: true
  },
  netAmount: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  // Snapshot of bank details at time of withdrawal
  bankDetails: {
    accountName: String,
    accountNumber: String,
    ifscCode: String,
    bankName: String
  },
  processedAt: {
    type: Date,
    default: null
  },
  remarks: {
    type: String,
    default: null
  }
}, { timestamps: true });

driverWithdrawalSchema.index({ driverId: 1, status: 1 });
driverWithdrawalSchema.index({ createdAt: -1 });

const DriverWithdrawal = mongoose.model('DriverWithdrawal', driverWithdrawalSchema);
module.exports = DriverWithdrawal;
