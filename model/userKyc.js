const mongoose = require('mongoose');
const userKycSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  // Personal Details
  fullName: {
    type: String,
    required: true
  },
  dateOfBirth: {
    type: Date,
    required: true
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other']
  },

  // Identity Documents
  panNumber: {
    type: String,
    uppercase: true,
    match: /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/
  },
  aadhaarNumber: {
    type: String,
    match: /^\d{12}$/
  },

  // Contact
  email: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: true
  },

  // Address
  address: {
    street: String,
    city: String,
    state: String,
    pincode: String,
    country: { type: String, default: 'India' }
  },

  // Bank Details (for EMI auto-debit)
  bankDetails: {
    accountHolderName: String,
    accountNumber: String,
    ifscCode: String,
    bankName: String,
    upiId: String
  },

  // Verification Status
  verificationStatus: {
    type: String,
    enum: ['pending', 'under_review', 'verified', 'rejected'],
    default: 'pending'
  },
  verifiedAt: Date,
  rejectionReason: String,

  // Credit Assessment
  creditScore: {
    type: Number,
    min: 300,
    max: 900
  },
  creditLimit: {
    type: Number,
    default: 0
  },

  // Document uploads
  documents: {
    panCard: String,      // URL to uploaded image
    aadhaarFront: String,
    aadhaarBack: String,
    selfie: String
  }
}, { timestamps: true });
module.exports = mongoose.model('UserKyc', userKycSchema);
