const Razorpay = require('razorpay');
const crypto = require('crypto');
const Order = require('../model/order');

// Lazy Razorpay initialization (prevents crash if keys missing)
let razorpay = null;

function getRazorpay() {
    if (!razorpay) {
        const keyId = process.env.RAZORPAY_KEY_ID;
        const keySecret = process.env.RAZORPAY_KEY_SECRET;

        if (!keyId || !keySecret || keyId.includes('YOUR_KEY')) {
            throw new Error('Razorpay keys not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env');
        }

        razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    }
    return razorpay;
}

/**
 * Initiate Order - Create order in DB and Razorpay
 * This is called when user clicks "Pay Now"
 */
const initiateOrder = async (req, res) => {
    try {
        const { items, shippingAddress, paymentMethod, couponCode } = req.body;
        const userID = req.user.id;

        // Calculate total on server (never trust client)
        let subtotal = 0;
        for (const item of items) {
            subtotal += item.price * item.quantity;
        }

        // Apply discount if coupon exists (TODO: validate coupon)
        const discount = 0;
        const shippingCharge = 49; // ₹49 flat shipping charge
        const total = subtotal - discount + shippingCharge;

        // Create order in database with status 'created'
        const order = new Order({
            userID,
            items,
            totalPrice: total,
            shippingAddress,
            paymentMethod,
            couponCode,
            orderStatus: 'pending',
            paymentStatus: 'created',
            shippingCharge,
            orderTotal: { subtotal, discount, total }
        });
        await order.save();

        // If COD, no Razorpay needed
        if (paymentMethod === 'cod') {
            order.paymentStatus = 'pending'; // Will be paid on delivery
            await order.save();
            return res.json({
                success: true,
                message: 'COD order placed successfully',
                data: { orderId: order._id, paymentStatus: 'cod' }
            });
        }

        // Create Razorpay order
        const razorpayOrder = await getRazorpay().orders.create({
            amount: Math.round(total * 100), // Amount in paise
            currency: 'INR',
            receipt: order._id.toString(),
            notes: {
                userId: userID,
                orderId: order._id.toString()
            }
        });

        // Save Razorpay order ID
        order.razorpayOrderId = razorpayOrder.id;
        await order.save();

        res.json({
            success: true,
            message: 'Payment initiated',
            data: {
                orderId: order._id,
                razorpayOrderId: razorpayOrder.id,
                razorpayKeyId: process.env.RAZORPAY_KEY_ID,
                amount: total,
                currency: 'INR',
                name: 'AsBrand',
                description: `Order #${order._id}`,
            }
        });
    } catch (error) {
        console.error('Initiate order error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Verify Payment - Validate Razorpay signature
 * This is the ANTI-FRAUD step - CRITICAL for security
 */
const verifyPayment = async (req, res) => {
    try {
        const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        // Find order
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // Verify signature using HMAC SHA256
        const body = razorpay_order_id + '|' + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body)
            .digest('hex');

        const isValid = expectedSignature === razorpay_signature;

        if (isValid) {
            // Payment verified - Update order
            order.paymentStatus = 'paid';
            order.razorpayPaymentId = razorpay_payment_id;
            order.razorpaySignature = razorpay_signature;
            order.orderStatus = 'processing';
            order.deliveryStatus = 'PENDING';
            await order.save();

            res.json({
                success: true,
                message: 'Payment verified successfully',
                data: { orderId: order._id, paymentStatus: 'paid' }
            });
        } else {
            // Signature mismatch - possible fraud attempt
            order.paymentStatus = 'failed';
            await order.save();

            res.status(400).json({
                success: false,
                message: 'Payment verification failed - invalid signature'
            });
        }
    } catch (error) {
        console.error('Verify payment error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Place COD Order - For Cash on Delivery
 */
const placeCodOrder = async (req, res) => {
    try {
        const { items, shippingAddress, couponCode } = req.body;
        const userID = req.user.id;

        // Calculate total on server
        let subtotal = 0;
        for (const item of items) {
            subtotal += item.price * item.quantity;
        }
        const discount = 0;
        const total = subtotal - discount;

        const order = new Order({
            userID,
            items,
            totalPrice: total,
            shippingAddress,
            paymentMethod: 'cod',
            couponCode,
            orderStatus: 'pending',
            paymentStatus: 'pending', // Payment on delivery
            orderTotal: { subtotal, discount, total }
        });
        await order.save();

        res.json({
            success: true,
            message: 'COD order placed successfully',
            data: { orderId: order._id }
        });
    } catch (error) {
        console.error('COD order error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Handle payment failure
 */
const handlePaymentFailure = async (req, res) => {
    try {
        const { orderId, error_code, error_description } = req.body;

        const order = await Order.findById(orderId);
        if (order) {
            order.paymentStatus = 'failed';
            await order.save();
        }

        res.json({
            success: true,
            message: 'Payment failure recorded',
            data: { orderId, error_code, error_description }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    initiateOrder,
    verifyPayment,
    placeCodOrder,
    handlePaymentFailure
};
