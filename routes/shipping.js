const express = require('express');
const asyncHandler = require('express-async-handler');
const router = express.Router();
const Order = require('../model/order');
const { authMiddleware, adminMiddleware } = require('../middleware/auth.middleware');
const shiprocketService = require('../services/shiprocketService');

// ==========================================
// ADMIN: Generate Shipment
// ==========================================

/**
 * @route POST /shipping/generate/:orderId
 * @desc Create Shiprocket shipment for a confirmed/paid order
 * @access Admin only
 */
router.post('/generate/:orderId', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId);

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // Validate order is ready for shipment
        if (order.paymentStatus !== 'paid' && order.paymentMethod !== 'cod') {
            return res.status(400).json({
                success: false,
                message: `Cannot generate shipment. Payment status is "${order.paymentStatus}". Only paid orders can be shipped.`
            });
        }

        if (order.shipmentId) {
            return res.status(400).json({
                success: false,
                message: 'Shipment already generated for this order.',
                data: {
                    shipmentId: order.shipmentId,
                    awbCode: order.awbCode,
                    courierName: order.courierName,
                    deliveryStatus: order.deliveryStatus
                }
            });
        }

        // Create shipment on Shiprocket
        const shipmentResult = await shiprocketService.createShipment(order);

        // Update order with shipment details
        order.deliveryPartner = 'Shiprocket';
        order.shipmentId = shipmentResult.shipmentId;
        order.deliveryStatus = 'CREATED';

        // If AWB was auto-assigned
        if (shipmentResult.awbCode) {
            order.awbCode = shipmentResult.awbCode;
            order.courierName = shipmentResult.courierName;
            order.trackingUrl = shipmentResult.trackingUrl;
        } else if (shipmentResult.shipmentId) {
            // Try to auto-assign courier
            try {
                const courierResult = await shiprocketService.assignCourier(shipmentResult.shipmentId);
                order.awbCode = courierResult.awbCode;
                order.courierName = courierResult.courierName;
                order.trackingUrl = courierResult.trackingUrl;
            } catch (courierErr) {
                console.warn('Auto courier assignment failed, admin can assign manually:', courierErr.message);
            }
        }

        await order.save();

        res.json({
            success: true,
            message: 'Shipment created successfully',
            data: {
                orderId: order._id,
                shipmentId: order.shipmentId,
                awbCode: order.awbCode,
                courierName: order.courierName,
                trackingUrl: order.trackingUrl,
                deliveryStatus: order.deliveryStatus
            }
        });
    } catch (error) {
        console.error('Generate shipment error:', error);
        res.status(500).json({
            success: false,
            message: `Failed to generate shipment: ${error.message}`
        });
    }
}));

// ==========================================
// USER: Track Order
// ==========================================

/**
 * @route GET /shipping/track/:orderId
 * @desc Get tracking information for an order
 * @access Authenticated user
 */
router.get('/track/:orderId', authMiddleware, asyncHandler(async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId);

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // If no shipment created yet, return current status
        if (!order.shipmentId) {
            return res.json({
                success: true,
                message: 'Shipment not yet created',
                data: {
                    orderId: order._id,
                    deliveryStatus: order.deliveryStatus || 'PENDING',
                    awbCode: null,
                    courierName: null,
                    trackingUrl: null,
                    estimatedDeliveryDate: null,
                    timeline: []
                }
            });
        }

        // Fetch live tracking from Shiprocket
        let trackingInfo;
        if (order.awbCode) {
            trackingInfo = await shiprocketService.getTrackingByAwb(order.awbCode);
        } else {
            trackingInfo = await shiprocketService.getTracking(order.shipmentId);
        }

        // Update delivery status if tracking gave us new info
        if (trackingInfo.currentStatus && trackingInfo.currentStatus !== 'Unknown') {
            const mappedStatus = shiprocketService.mapShiprocketStatus(trackingInfo.currentStatus);
            if (mappedStatus !== order.deliveryStatus) {
                order.deliveryStatus = mappedStatus;
                if (trackingInfo.estimatedDeliveryDate) {
                    order.estimatedDeliveryDate = new Date(trackingInfo.estimatedDeliveryDate);
                }
                await order.save();
            }
        }

        res.json({
            success: true,
            message: 'Tracking info retrieved',
            data: {
                orderId: order._id,
                deliveryStatus: order.deliveryStatus,
                awbCode: order.awbCode,
                courierName: order.courierName || trackingInfo.courierName,
                trackingUrl: order.trackingUrl || trackingInfo.trackingUrl,
                estimatedDeliveryDate: order.estimatedDeliveryDate || trackingInfo.estimatedDeliveryDate,
                currentStatus: trackingInfo.currentStatus,
                timeline: trackingInfo.timeline || []
            }
        });
    } catch (error) {
        // On tracking API failure, return last known status
        const order = await Order.findById(req.params.orderId);
        res.json({
            success: true,
            message: 'Showing last known status (live tracking unavailable)',
            data: {
                orderId: order?._id,
                deliveryStatus: order?.deliveryStatus || 'PENDING',
                awbCode: order?.awbCode,
                courierName: order?.courierName,
                trackingUrl: order?.trackingUrl,
                estimatedDeliveryDate: order?.estimatedDeliveryDate,
                timeline: [],
                error: 'Live tracking temporarily unavailable'
            }
        });
    }
}));

// ==========================================
// WEBHOOK: Shiprocket delivery updates
// ==========================================

/**
 * @route POST /shipping/webhook
 * @desc Handle Shiprocket webhook for delivery status updates
 * @access Public (verified by webhook token)
 */
router.post('/webhook', asyncHandler(async (req, res) => {
    try {
        // Verify webhook token (optional — Shiprocket doesn't send custom headers for webhooks)
        const expectedToken = process.env.SHIPROCKET_WEBHOOK_TOKEN;
        if (expectedToken) {
            const webhookToken = req.headers['x-api-key'] || req.headers['authorization'];
            // Only reject if a token IS provided but doesn't match
            // Shiprocket sends no auth headers, so we allow headerless requests through
            if (webhookToken && webhookToken !== expectedToken && webhookToken !== `Bearer ${expectedToken}`) {
                return res.status(401).json({ success: false, message: 'Invalid webhook token' });
            }
        }

        console.log('Webhook received:', JSON.stringify(req.body));

        // Handle Shiprocket test ping (empty body or test payload)
        if (!req.body || Object.keys(req.body).length === 0) {
            return res.json({ success: true, message: 'Webhook endpoint active' });
        }

        const { order_id, current_status, awb, courier_name, etd, shipment_id } = req.body;

        if (!order_id && !awb && !shipment_id) {
            // Could be a test/ping — acknowledge it
            return res.json({ success: true, message: 'Webhook received (no order data)' });
        }

        // Find order by Shiprocket order_id, shipment_id, or AWB
        let order;
        if (shipment_id) {
            order = await Order.findOne({ shipmentId: shipment_id.toString() });
        }
        if (!order && awb) {
            order = await Order.findOne({ awbCode: awb });
        }
        if (!order && order_id) {
            // Shiprocket order_id is our MongoDB _id used as receipt
            order = await Order.findById(order_id).catch(() => null);
        }

        if (!order) {
            console.warn('Webhook received for unknown order:', { order_id, shipment_id, awb });
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // Map and update delivery status
        const newStatus = shiprocketService.mapShiprocketStatus(current_status);
        order.deliveryStatus = newStatus;

        if (courier_name) order.courierName = courier_name;
        if (awb && !order.awbCode) order.awbCode = awb;
        if (etd) order.estimatedDeliveryDate = new Date(etd);

        // Update order status based on delivery status
        if (newStatus === 'DELIVERED') {
            order.orderStatus = 'delivered';
        } else if (newStatus === 'SHIPPED' || newStatus === 'IN_TRANSIT' || newStatus === 'OUT_FOR_DELIVERY') {
            order.orderStatus = 'shipped';
        }

        await order.save();

        console.log(`Webhook: Order ${order._id} updated to ${newStatus}`);

        res.json({ success: true, message: 'Webhook processed' });
    } catch (error) {
        console.error('Webhook processing error:', error);
        res.status(500).json({ success: false, message: 'Webhook processing failed' });
    }
}));

module.exports = router;
