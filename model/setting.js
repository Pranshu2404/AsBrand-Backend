const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema({
  referralRewardPercent: {
    type: Number,
    default: 0
  },
  firstOrderRewardPercent: {
    type: Number,
    default: 0
  },
  // Delivery charge tiers (distance-based)
  deliveryChargeWithin1km: {
    type: Number,
    default: 10
  },
  deliveryChargePerKm2to5: {
    type: Number,
    default: 9
  },
  deliveryChargeOver5km: {
    type: Number,
    default: 29
  },
  // Handling & other charges
  handlingCharge: {
    type: Number,
    default: 5
  }
}, { timestamps: true });

const Setting = mongoose.model('Setting', settingSchema);

module.exports = Setting;
