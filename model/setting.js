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
  },
  // Driver earnings configuration
  driverPickupFreeKm: {
    type: Number,
    default: 1   // Pickup distance under this = ₹0
  },
  driverPickupRatePerKm: {
    type: Number,
    default: 3   // ₹ per km for pickup beyond free threshold
  },
  driverDropRatePerKm: {
    type: Number,
    default: 12  // ₹ per km for drop-off
  }
}, { timestamps: true });

const Setting = mongoose.model('Setting', settingSchema);

module.exports = Setting;
