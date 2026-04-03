const mongoose = require('mongoose');

const driverSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  fullName: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    unique: true
  },
  vehicleType: {
    type: String,
    enum: ['bike', 'car', 'van'],
    required: true
  },
  vehicleNumber: {
    type: String,
    required: true,
    trim: true
  },
  profilePhoto: {
    type: String, // Cloudinary URL
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isOnline: {
    type: Boolean,
    default: false
  },
  isProfileComplete: {
    type: Boolean,
    default: false
  },
  loadCapacity: {
    type: String,
    default: 'Upto 30kg'
  },
  dlVerified: {
    type: Boolean,
    default: false
  },
  currentLocation: {
    lat: { type: Number, default: 0 },
    lng: { type: Number, default: 0 },
    updatedAt: { type: Date, default: Date.now }
  },
  walletBalance: {
    type: Number,
    default: 0
  },
  totalEarnings: {
    type: Number,
    default: 0
  },
  bankDetails: {
    accountName: { type: String },
    accountNumber: { type: String },
    ifscCode: { type: String },
    bankName: { type: String }
  }
}, { timestamps: true });

const Driver = mongoose.model('Driver', driverSchema);
module.exports = Driver;
