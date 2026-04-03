const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const Subscription = require('../model/subscription');
const { authMiddleware, driverMiddleware } = require('../middleware/auth.middleware');

// GET /subscription  - Public/Driver can get active subscriptions
router.get('/', asyncHandler(async (req, res) => {
    try {
        const subscriptions = await Subscription.find({ isActive: true }).sort({ createdAt: -1 });
        res.json({ success: true, message: "Subscriptions retrieved successfully.", data: subscriptions });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

// POST /subscription - Admin only
router.post('/', asyncHandler(async (req, res) => {
    try {
        // Typically adding adminMiddleware here, but according to previous patterns some admin endpoints might skip depending on architecture,
        // Assuming admin handles its own token or it's accessed via admin panel which is loosely coupled.
        const { name, vehicleType, validity, price, features, isActive } = req.body;
        
        if (!name || !vehicleType || !validity || price == null) {
            return res.status(400).json({ success: false, message: "Required fields missing." });
        }

        const subscription = new Subscription({
            name, vehicleType, validity, price, features: features || [], isActive: isActive !== false
        });

        const newSub = await subscription.save();
        res.json({ success: true, message: "Subscription created.", data: newSub });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

// PUT /subscription/:id - Admin only
router.put('/:id', asyncHandler(async (req, res) => {
    try {
        const { name, vehicleType, validity, price, features, isActive } = req.body;
        const sub = await Subscription.findById(req.params.id);
        if (!sub) return res.status(404).json({ success: false, message: "Not found." });

        if (name) sub.name = name;
        if (vehicleType) sub.vehicleType = vehicleType;
        if (validity) sub.validity = validity;
        if (price !== undefined) sub.price = price;
        if (features) sub.features = features;
        if (isActive !== undefined) sub.isActive = isActive;

        await sub.save();
        res.json({ success: true, message: "Subscription updated.", data: sub });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

// DELETE /subscription/:id - Admin only
router.delete('/:id', asyncHandler(async (req, res) => {
    try {
        const sub = await Subscription.findByIdAndDelete(req.params.id);
        if (!sub) return res.status(404).json({ success: false, message: "Not found." });
        res.json({ success: true, message: "Subscription deleted." });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

module.exports = router;
