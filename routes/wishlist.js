const express = require('express');
const asyncHandler = require('express-async-handler');
const router = express.Router();
const Wishlist = require('../model/wishlist');
const { authMiddleware } = require('../middleware/auth.middleware');

// Get Wishlist
router.get('/', authMiddleware, asyncHandler(async (req, res) => {
    let wishlist = await Wishlist.findOne({ userId: req.user.id }).populate('products');

    if (!wishlist) {
        wishlist = await Wishlist.create({ userId: req.user.id, products: [] });
    }

    res.json({ success: true, data: wishlist });
}));

// Add to Wishlist
router.post('/add', authMiddleware, asyncHandler(async (req, res) => {
    const { productId } = req.body;

    let wishlist = await Wishlist.findOne({ userId: req.user.id });

    if (!wishlist) {
        wishlist = new Wishlist({ userId: req.user.id, products: [] });
    }

    if (!wishlist.products.includes(productId)) {
        wishlist.products.push(productId);
        await wishlist.save();
    }

    await wishlist.populate('products');
    res.json({ success: true, data: wishlist });
}));

// Remove from Wishlist
router.delete('/remove/:productId', authMiddleware, asyncHandler(async (req, res) => {
    const { productId } = req.params;

    let wishlist = await Wishlist.findOne({ userId: req.user.id });

    if (wishlist) {
        wishlist.products = wishlist.products.filter(p => p.toString() !== productId);
        await wishlist.save();
        await wishlist.populate('products');
    }

    res.json({ success: true, data: wishlist });
}));

module.exports = router;
