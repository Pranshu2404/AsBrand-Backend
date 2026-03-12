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
    const { productId, quantity = 1, emiMonths = 3, variant } = req.body;

    let cart = await Cart.findOne({ userId: req.user.id });

    if (!cart) {
        cart = new Cart({ userId: req.user.id, items: [] });
    }

    const existingItemIndex = cart.items.findIndex(item => item.product.toString() === productId && (item.variant || '') === (variant || ''));

    if (existingItemIndex > -1) {
        cart.items[existingItemIndex].quantity += quantity;
        // Update emiMonths if provided? Usually we keep existing or update. Let's update.
        if (req.body.emiMonths) cart.items[existingItemIndex].emiMonths = emiMonths;
    } else {
        cart.items.push({ product: productId, quantity, variant, emiMonths });
    }

    await cart.save();
    await cart.populate('items.product');

    res.json({ success: true, data: cart });
}));

// Update Cart Item (Quantity / EMI)
router.put('/update', authMiddleware, asyncHandler(async (req, res) => {
    const { productId, quantity, emiMonths, variant } = req.body;

    let cart = await Cart.findOne({ userId: req.user.id });

    if (!cart) {
        return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    const itemIndex = cart.items.findIndex(item => item.product.toString() === productId && (item.variant || '') === (variant || ''));

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
    const { variant } = req.query;

    let cart = await Cart.findOne({ userId: req.user.id });

    if (!cart) {
        return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    cart.items = cart.items.filter(item => !(item.product.toString() === productId && (item.variant || '') === (variant || '')));

    await cart.save();
    await cart.populate('items.product');

    res.json({ success: true, data: cart });
}));

// Sync Cart (Merge local cart into backend cart)
router.post('/sync', authMiddleware, asyncHandler(async (req, res) => {
    const { items } = req.body; // Expects array of { productId, quantity, emiMonths }

    if (!items || !Array.isArray(items)) {
        return res.status(400).json({ success: false, message: 'Invalid items data' });
    }

    let cart = await Cart.findOne({ userId: req.user.id });
    if (!cart) {
        cart = new Cart({ userId: req.user.id, items: [] });
    }

    for (const localItem of items) {
        const existingIndex = cart.items.findIndex(i => i.product.toString() === localItem.productId && (i.variant || '') === (localItem.variant || ''));
        if (existingIndex > -1) {
            // Same as before
        } else {
            cart.items.push({
                product: localItem.productId,
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

module.exports = router;
