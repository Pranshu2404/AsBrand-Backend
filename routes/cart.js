const express = require('express');
const asyncHandler = require('express-async-handler');
const router = express.Router();
const Cart = require('../model/cart');
const Product = require('../model/product');
const { authMiddleware } = require('../middleware/auth.middleware');

// Get Cart
router.get('/', authMiddleware, asyncHandler(async (req, res) => {
    let cart = await Cart.findOne({ userId: req.user.id }).populate('items.product');

    if (!cart) {
        cart = await Cart.create({ userId: req.user.id, items: [] });
    }

    res.json({ success: true, data: cart });
}));

// Add to Cart
router.post('/add', authMiddleware, asyncHandler(async (req, res) => {
    const { productId, supplierId, quantity = 1, emiMonths = 3, variant } = req.body;

    if (!supplierId) {
        return res.status(400).json({ success: false, message: 'Supplier ID is required' });
    }

    let cart = await Cart.findOne({ userId: req.user.id });

    if (!cart) {
        cart = new Cart({ userId: req.user.id, items: [] });
    }

    const existingItemIndex = cart.items.findIndex(item => 
        item.product.toString() === productId && 
        item.supplierId.toString() === supplierId && 
        (item.variant || '') === (variant || '')
    );

    if (existingItemIndex > -1) {
        cart.items[existingItemIndex].quantity += quantity;
        if (req.body.emiMonths) cart.items[existingItemIndex].emiMonths = emiMonths;
    } else {
        cart.items.push({ product: productId, supplierId, quantity, variant, emiMonths });
    }

    await cart.save();
    await cart.populate('items.product');

    res.json({ success: true, data: cart });
}));

// Update Cart Item (Quantity / EMI)
router.put('/update', authMiddleware, asyncHandler(async (req, res) => {
    const { productId, supplierId, quantity, emiMonths, variant } = req.body;

    let cart = await Cart.findOne({ userId: req.user.id });

    if (!cart) {
        return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    const itemIndex = cart.items.findIndex(item => 
        item.product.toString() === productId && 
        item.supplierId.toString() === supplierId && 
        (item.variant || '') === (variant || '')
    );

    if (itemIndex > -1) {
        if (quantity !== undefined) cart.items[itemIndex].quantity = quantity;
        if (emiMonths !== undefined) cart.items[itemIndex].emiMonths = emiMonths;

        await cart.save();
        await cart.populate('items.product');
        res.json({ success: true, data: cart });
    } else {
        res.status(404).json({ success: false, message: 'Item not in cart' });
    }
}));

// Remove from Cart
router.delete('/remove/:productId', authMiddleware, asyncHandler(async (req, res) => {
    const { productId } = req.params;
    const { variant, supplierId } = req.query;

    let cart = await Cart.findOne({ userId: req.user.id });

    if (!cart) {
        return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    cart.items = cart.items.filter(item => 
        !(item.product.toString() === productId && 
          item.supplierId.toString() === supplierId && 
          (item.variant || '') === (variant || ''))
    );

    await cart.save();
    await cart.populate('items.product');

    res.json({ success: true, data: cart });
}));

// Sync Cart (Merge local cart into backend cart)
router.post('/sync', authMiddleware, asyncHandler(async (req, res) => {
    const { items } = req.body; // Expects array of { productId, supplierId, quantity, emiMonths, variant }

    if (!items || !Array.isArray(items)) {
        return res.status(400).json({ success: false, message: 'Invalid items data' });
    }

    let cart = await Cart.findOne({ userId: req.user.id });
    if (!cart) {
        cart = new Cart({ userId: req.user.id, items: [] });
    }

    for (const localItem of items) {
        const existingIndex = cart.items.findIndex(i => 
            i.product.toString() === localItem.productId && 
            i.supplierId.toString() === localItem.supplierId && 
            (i.variant || '') === (localItem.variant || '')
        );
        if (existingIndex > -1) {
            // Same as before
        } else {
            cart.items.push({
                product: localItem.productId,
                supplierId: localItem.supplierId,
                quantity: localItem.quantity,
                variant: localItem.variant,
                emiMonths: localItem.emiMonths
            });
        }
    }

    await cart.save();
    await cart.populate('items.product');
    res.json({ success: true, data: cart });
}));

// Validate cart delivery distance
router.post('/verify-delivery', authMiddleware, asyncHandler(async (req, res) => {
    const { items, lat, lng } = req.body;
    
    if (!lat || !lng || !items || !Array.isArray(items)) {
        return res.json({ success: true, message: 'Skipped - Missing coordinates or items' });
    }

    const supplierIds = [...new Set(items.map(i => i.supplierId).filter(Boolean))];
    if (supplierIds.length === 0) {
        return res.json({ success: true, message: 'Delivery location within range.' });
    }

    const User = require('../model/user'); 
    const suppliers = await User.find({ _id: { $in: supplierIds } })
        .select('_id supplierProfile.pickupAddress.latitude supplierProfile.pickupAddress.longitude')
        .lean();

    const haversineKm = (lat1, lon1, lat2, lon2) => {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    let invalidSupplier = null;
    for (const s of suppliers) {
        const pickupLat = s.supplierProfile?.pickupAddress?.latitude;
        const pickupLng = s.supplierProfile?.pickupAddress?.longitude;
        if (pickupLat != null && pickupLng != null && !isNaN(pickupLat) && !isNaN(pickupLng)) {
            const dist = haversineKm(lat, lng, pickupLat, pickupLng);
            if (dist > 10) {
                invalidSupplier = s._id;
                break;
            }
        }
    }

    if (invalidSupplier) {
        return res.json({ success: false, message: 'This product is not available in your area.' });
    }

    res.json({ success: true, message: 'Delivery location within range.' });
}));

module.exports = router;
