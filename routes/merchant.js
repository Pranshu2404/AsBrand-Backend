const express = require('express');
const router = express.Router();
const MerchantSettlement = require('../model/merchantSettlement');
const EmiApplication = require('../model/emiApplication');
const Order = require('../model/order');
const { authMiddleware, adminMiddleware } = require('../middleware/auth.middleware');

/**
 * @route   GET /api/merchant/settlements
 * @desc    Get settlement list for merchant
 * @access  Private (Admin/Merchant)
 */
router.get('/settlements', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { status, startDate, endDate, page = 1, limit = 20 } = req.query;

        const query = {};
        if (status) query.status = status;
        if (startDate && endDate) {
            query.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
        }

        const settlements = await MerchantSettlement.find(query)
            .populate('orderId', 'orderNumber totalPrice')
            .populate('emiApplicationId', 'tenure monthlyEmi')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        const total = await MerchantSettlement.countDocuments(query);

        res.json({
            success: true,
            data: settlements,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @route   GET /api/merchant/settlements/summary
 * @desc    Get settlement summary/dashboard
 * @access  Private (Admin/Merchant)
 */
router.get('/settlements/summary', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        const matchQuery = {};
        if (startDate && endDate) {
            matchQuery.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
        }

        const summary = await MerchantSettlement.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: null,
                    totalOrders: { $sum: 1 },
                    totalSales: { $sum: '$totalPrice' },
                    totalSettled: { $sum: { $cond: [{ $eq: ['$status', 'settled'] }, '$netSettlement', 0] } },
                    pendingSettlement: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$netSettlement', 0] } },
                    totalPlatformFees: { $sum: '$platformFee' },
                    totalRefunds: { $sum: { $cond: ['$refund.isRefunded', '$refund.refundAmount', 0] } }
                }
            }
        ]);

        const statusBreakdown = await MerchantSettlement.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    amount: { $sum: '$netSettlement' }
                }
            }
        ]);

        res.json({
            success: true,
            data: {
                summary: summary[0] || {},
                byStatus: statusBreakdown
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @route   POST /api/merchant/refund/:orderId
 * @desc    Process refund and cancel mandate
 * @access  Private (Admin)
 */
router.post('/refund/:orderId', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { orderId } = req.params;
        const { refundReason, refundAmount } = req.body;

        // Find the order
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // Find the settlement record
        const settlement = await MerchantSettlement.findOne({ orderId });
        if (!settlement) {
            return res.status(404).json({ success: false, message: 'Settlement not found' });
        }

        if (settlement.refund.isRefunded) {
            return res.status(400).json({ success: false, message: 'Already refunded' });
        }

        // Find EMI application if exists
        const emiApplication = settlement.emiApplicationId
            ? await EmiApplication.findById(settlement.emiApplicationId)
            : null;

        // Calculate refund amount (if not specified, refund full amount)
        const actualRefundAmount = refundAmount || settlement.totalPrice;

        // Update settlement record
        settlement.status = 'refunded';
        settlement.refund = {
            isRefunded: true,
            refundAmount: actualRefundAmount,
            refundReason: refundReason || 'Customer requested refund',
            refundDate: new Date(),
            mandateCancelled: !!emiApplication
        };
        await settlement.save();

        // Update order status
        order.orderStatus = 'refunded';
        await order.save();

        // Cancel EMI mandate if exists
        if (emiApplication) {
            emiApplication.status = 'cancelled';
            emiApplication.refundDetails = {
                refundedAt: new Date(),
                refundAmount: actualRefundAmount,
                reason: refundReason
            };
            await emiApplication.save();

            // TODO: Cancel Razorpay mandate via API
            // await razorpay.subscriptions.cancel(emiApplication.mandateId, { cancel_at_cycle_end: false });
        }

        // TODO: Process actual refund via payment gateway
        // For down payment: Reverse the Razorpay transaction

        res.json({
            success: true,
            message: 'Refund processed successfully',
            data: {
                orderId: order._id,
                refundAmount: actualRefundAmount,
                mandateCancelled: !!emiApplication,
                refundDate: settlement.refund.refundDate
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @route   POST /api/merchant/settle/:settlementId
 * @desc    Mark settlement as settled (after bank transfer)
 * @access  Private (Admin)
 */
router.post('/settle/:settlementId', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { settlementId } = req.params;
        const { utr, bankAccountLast4, ifsc } = req.body;

        const settlement = await MerchantSettlement.findById(settlementId);
        if (!settlement) {
            return res.status(404).json({ success: false, message: 'Settlement not found' });
        }

        if (settlement.status === 'settled') {
            return res.status(400).json({ success: false, message: 'Already settled' });
        }

        settlement.status = 'settled';
        settlement.settlementDate = new Date();
        settlement.transferDetails = {
            utr,
            bankAccountLast4,
            ifsc,
            transferredAt: new Date()
        };
        await settlement.save();

        res.json({
            success: true,
            message: 'Settlement marked as complete',
            data: settlement
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
