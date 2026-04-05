const express = require('express');
const asyncHandler = require('express-async-handler');
const router = express.Router();
const Setting = require('../model/setting');

// GET settings (publicly accessible or protected, but let's allow it for general use or just admin)
router.get('/', asyncHandler(async (req, res) => {
    try {
        let setting = await Setting.findOne();
        if (!setting) {
            setting = new Setting();
            await setting.save();
        }
        res.json({ success: true, message: "Settings retrieved successfully.", data: setting });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

// UPDATE settings
router.put('/', asyncHandler(async (req, res) => {
    try {
        const {
            referralRewardPercent, firstOrderRewardPercent,
            deliveryChargeWithin1km, deliveryChargePerKm2to5,
            deliveryChargeOver5km, handlingCharge
        } = req.body;
        
        let setting = await Setting.findOne();
        if (!setting) {
            setting = new Setting(req.body);
        } else {
            if (referralRewardPercent !== undefined) setting.referralRewardPercent = referralRewardPercent;
            if (firstOrderRewardPercent !== undefined) setting.firstOrderRewardPercent = firstOrderRewardPercent;
            if (deliveryChargeWithin1km !== undefined) setting.deliveryChargeWithin1km = deliveryChargeWithin1km;
            if (deliveryChargePerKm2to5 !== undefined) setting.deliveryChargePerKm2to5 = deliveryChargePerKm2to5;
            if (deliveryChargeOver5km !== undefined) setting.deliveryChargeOver5km = deliveryChargeOver5km;
            if (handlingCharge !== undefined) setting.handlingCharge = handlingCharge;
        }

        const updatedSetting = await setting.save();
        res.json({ success: true, message: "Settings updated successfully.", data: updatedSetting });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

module.exports = router;
