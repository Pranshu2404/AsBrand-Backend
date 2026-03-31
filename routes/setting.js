const express = require('express');
const asyncHandler = require('express-async-handler');
const router = express.Router();
const Setting = require('../model/setting');
const { adminMiddleware } = require('../middleware/auth.middleware');

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

// UPDATE settings (Admin only)
router.put('/', adminMiddleware, asyncHandler(async (req, res) => {
    try {
        const { referralRewardPercent, firstOrderRewardPercent } = req.body;
        
        let setting = await Setting.findOne();
        if (!setting) {
            setting = new Setting({ referralRewardPercent, firstOrderRewardPercent });
        } else {
            if (referralRewardPercent !== undefined) setting.referralRewardPercent = referralRewardPercent;
            if (firstOrderRewardPercent !== undefined) setting.firstOrderRewardPercent = firstOrderRewardPercent;
        }

        const updatedSetting = await setting.save();
        res.json({ success: true, message: "Settings updated successfully.", data: updatedSetting });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

module.exports = router;
