const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema({
  referralRewardPercent: {
    type: Number,
    default: 0
  },
  firstOrderRewardPercent: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

const Setting = mongoose.model('Setting', settingSchema);

module.exports = Setting;
