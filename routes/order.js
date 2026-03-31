const express = require('express');
const asyncHandler = require('express-async-handler');
const router = express.Router();
const Order = require('../model/order');
const { authMiddleware } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate');
const { createOrderSchema, updateOrderSchema } = require('../validators/schemas');
const Setting = require('../model/setting');
const Coupon = require('../model/couponCode');
const User = require('../model/user');

// Get all orders
router.get('/', asyncHandler(async (req, res) => {
    try {
        const orders = await Order.find()
            .populate('couponCode', 'id couponCode discountType discountAmount')
            .populate('userID', 'id name').sort({ _id: -1 });
        res.json({ success: true, message: "Orders retrieved successfully.", data: orders });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));


router.get('/orderByUserId/:userId', asyncHandler(async (req, res) => {
    try {
        const userId = req.params.userId;
        const orders = await Order.find({ userID: userId })
            .populate('couponCode', 'id couponCode discountType discountAmount')
            .populate('userID', 'id name')
            .sort({ _id: -1 });
        res.json({ success: true, message: "Orders retrieved successfully.", data: orders });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));


// Get current user's orders (must be ABOVE /:id to avoid wildcard match)
router.get('/my-orders', authMiddleware, asyncHandler(async (req, res) => {
    try {
        const orders = await Order.find({ userID: req.user.id })
            .populate('couponCode', 'id couponCode discountType discountAmount')
            .populate('items.productID', 'name primaryImage images price offerPrice')
            .sort({ _id: -1 });
        res.json({ success: true, message: "Orders retrieved successfully.", data: orders });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

// Get an order by ID
router.get('/:id', asyncHandler(async (req, res) => {
    try {
        const orderID = req.params.id;
        const order = await Order.findById(orderID)
            .populate('couponCode', 'id couponCode discountType discountAmount')
            .populate('userID', 'id name');
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found." });
        }
        res.json({ success: true, message: "Order retrieved successfully.", data: order });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

// Create a new order
router.post('/', authMiddleware, validate(createOrderSchema), asyncHandler(async (req, res) => {
    const { orderStatus, items, totalPrice, shippingAddress, paymentMethod, couponCode, orderTotal, trackingUrl } = req.body;
    const userID = req.user.id;

    const order = new Order({ userID, orderStatus, items, totalPrice, shippingAddress, paymentMethod, couponCode, orderTotal, trackingUrl });
    const newOrder = await order.save();

    // After order is created, perform coupon operations
    try {
        // 1. Mark coupon as used if applied
        if (couponCode) {
            const coupon = await Coupon.findById(couponCode);
            if (coupon && coupon.isSingleUse) {
                if (!coupon.usedBy.includes(userID)) {
                    coupon.usedBy.push(userID);
                    await coupon.save();
                }
            }
        }

        // 2. Check if this is the user's FIRST order
        const previousOrdersCount = await Order.countDocuments({ userID });
        if (previousOrdersCount === 1) { // 1 because we just saved the new order
            const user = await User.findById(userID);
            if (user && user.referredBy) {
                const setting = await Setting.findOne();
                if (setting && setting.referralRewardPercent > 0) {
                    const refCode = 'REF-' + Math.random().toString(36).substring(2, 8).toUpperCase();
                    const refCoupon = new Coupon({
                        couponCode: refCode,
                        discountType: 'percentage',
                        discountAmount: setting.referralRewardPercent,
                        minimumPurchaseAmount: 0,
                        endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days
                        status: 'active',
                        userID: user.referredBy,
                        isFirstOrderOnly: false,
                        isSingleUse: true
                    });
                    await refCoupon.save();
                }
            }
        }
    } catch (err) {
        console.error('Error processing post-order coupon logic:', err);
    }

    res.json({ success: true, message: "Order created successfully.", data: newOrder });
}));

// Update an order
router.put('/:id', asyncHandler(async (req, res) => {
    try {
        const orderID = req.params.id;
        const { orderStatus, trackingUrl } = req.body;
        if (!orderStatus) {
            return res.status(400).json({ success: false, message: "Order Status required." });
        }

        const updatedOrder = await Order.findByIdAndUpdate(
            orderID,
            { orderStatus, trackingUrl },
            { new: true }
        );

        if (!updatedOrder) {
            return res.status(404).json({ success: false, message: "Order not found." });
        }

        res.json({ success: true, message: "Order updated successfully.", data: updatedOrder });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

// Delete an order
router.delete('/:id', asyncHandler(async (req, res) => {
    try {
        const orderID = req.params.id;
        const deletedOrder = await Order.findByIdAndDelete(orderID);
        if (!deletedOrder) {
            return res.status(404).json({ success: false, message: "Order not found." });
        }
        res.json({ success: true, message: "Order deleted successfully." });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

module.exports = router;
