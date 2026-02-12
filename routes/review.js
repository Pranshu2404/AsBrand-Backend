const express = require('express');
const asyncHandler = require('express-async-handler');
const router = express.Router();
const Review = require('../model/review');
const Order = require('../model/order');
const User = require('../model/user');
const { authMiddleware, adminMiddleware } = require('../middleware/auth.middleware');
const { uploadReview } = require('../uploadFile');

// ==========================================
// POST: Submit a review
// ==========================================

/**
 * @route POST /reviews
 * @desc Submit a product review with optional images
 * @access Authenticated (verified buyer only)
 */
router.post('/', authMiddleware, uploadReview.array('images', 5), asyncHandler(async (req, res) => {
    try {
        const { productID, orderID, rating, title, comment } = req.body;
        const userID = req.user._id;

        if (!productID || !orderID || !rating) {
            return res.status(400).json({
                success: false,
                message: 'productID, orderID, and rating are required'
            });
        }

        if (rating < 1 || rating > 5) {
            return res.status(400).json({
                success: false,
                message: 'Rating must be between 1 and 5'
            });
        }

        // Check if user already reviewed this product
        const existingReview = await Review.findOne({ productID, userID });
        if (existingReview) {
            return res.status(409).json({
                success: false,
                message: 'You have already reviewed this product. You can update your existing review.'
            });
        }

        // Verify the user actually bought this product and it was delivered
        const order = await Order.findOne({
            _id: orderID,
            userID: userID,
            'items.productID': productID,
            orderStatus: { $in: ['delivered', 'shipped'] }
        });

        const isVerifiedPurchase = !!order;

        if (!isVerifiedPurchase) {
            return res.status(403).json({
                success: false,
                message: 'You can only review products from your delivered orders'
            });
        }

        // Process uploaded images
        const images = [];
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                images.push({
                    url: file.path,  // Cloudinary URL
                    publicId: file.filename  // Cloudinary public_id
                });
            }
        }

        // Get user name for denormalized display
        const user = await User.findById(userID).select('name');

        const review = new Review({
            productID,
            userID,
            orderID,
            rating: parseInt(rating),
            title: title || '',
            comment: comment || '',
            images,
            isVerifiedPurchase,
            userName: user?.name || 'Anonymous'
        });

        await review.save();

        res.status(201).json({
            success: true,
            message: 'Review submitted successfully',
            data: review
        });
    } catch (error) {
        // Handle duplicate key error (race condition)
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: 'You have already reviewed this product'
            });
        }
        console.error('Submit review error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}));

// ==========================================
// GET: Product reviews
// ==========================================

/**
 * @route GET /reviews/product/:productId
 * @desc Get all approved reviews for a product
 * @access Public
 */
router.get('/product/:productId', asyncHandler(async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const sort = req.query.sort || '-createdAt';  // newest first

        const query = {
            productID: req.params.productId,
            isApproved: true
        };

        const [reviews, total] = await Promise.all([
            Review.find(query)
                .sort(sort)
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            Review.countDocuments(query)
        ]);

        res.json({
            success: true,
            message: 'Reviews fetched',
            data: reviews,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

// ==========================================
// GET: Rating statistics for a product
// ==========================================

/**
 * @route GET /reviews/stats/:productId
 * @desc Get rating summary (avg, count per star)
 * @access Public
 */
router.get('/stats/:productId', asyncHandler(async (req, res) => {
    try {
        const productId = req.params.productId;

        const stats = await Review.aggregate([
            { $match: { productID: require('mongoose').Types.ObjectId(productId), isApproved: true } },
            {
                $group: {
                    _id: null,
                    averageRating: { $avg: '$rating' },
                    totalReviews: { $sum: 1 },
                    stars5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
                    stars4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
                    stars3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
                    stars2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
                    stars1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
                }
            }
        ]);

        const result = stats.length > 0 ? stats[0] : {
            averageRating: 0,
            totalReviews: 0,
            stars5: 0, stars4: 0, stars3: 0, stars2: 0, stars1: 0
        };

        // Clean up _id field
        delete result._id;
        result.averageRating = Math.round(result.averageRating * 10) / 10;

        res.json({
            success: true,
            message: 'Rating stats fetched',
            data: result
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

// ==========================================
// GET: Current user's reviews
// ==========================================

/**
 * @route GET /reviews/my-reviews
 * @desc Get all reviews by current user
 * @access Authenticated
 */
router.get('/my-reviews', authMiddleware, asyncHandler(async (req, res) => {
    try {
        const reviews = await Review.find({ userID: req.user._id })
            .populate('productID', 'name images')
            .sort('-createdAt')
            .lean();

        res.json({
            success: true,
            message: 'My reviews fetched',
            data: reviews
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

// ==========================================
// PUT: Update own review
// ==========================================

/**
 * @route PUT /reviews/:id
 * @desc Update own review
 * @access Authenticated (own review only)
 */
router.put('/:id', authMiddleware, uploadReview.array('images', 5), asyncHandler(async (req, res) => {
    try {
        const review = await Review.findById(req.params.id);

        if (!review) {
            return res.status(404).json({ success: false, message: 'Review not found' });
        }

        if (review.userID.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized to update this review' });
        }

        const { rating, title, comment } = req.body;

        if (rating) review.rating = parseInt(rating);
        if (title !== undefined) review.title = title;
        if (comment !== undefined) review.comment = comment;

        // Add new images (append to existing)
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                review.images.push({
                    url: file.path,
                    publicId: file.filename
                });
            }
            // Cap at 5 images total
            if (review.images.length > 5) {
                review.images = review.images.slice(-5);
            }
        }

        await review.save();

        res.json({
            success: true,
            message: 'Review updated',
            data: review
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

// ==========================================
// DELETE: Delete review
// ==========================================

/**
 * @route DELETE /reviews/:id
 * @desc Delete a review (own review or admin)
 * @access Authenticated
 */
router.delete('/:id', authMiddleware, asyncHandler(async (req, res) => {
    try {
        const review = await Review.findById(req.params.id);

        if (!review) {
            return res.status(404).json({ success: false, message: 'Review not found' });
        }

        // Allow own user or admin
        const isOwner = review.userID.toString() === req.user._id.toString();
        const isAdmin = req.user.role === 'admin';

        if (!isOwner && !isAdmin) {
            return res.status(403).json({ success: false, message: 'Not authorized to delete this review' });
        }

        await Review.findByIdAndDelete(req.params.id);

        res.json({
            success: true,
            message: 'Review deleted'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

// ==========================================
// GET: Check if user can review a product
// ==========================================

/**
 * @route GET /reviews/can-review/:productId
 * @desc Check if current user can review this product
 * @access Authenticated
 */
router.get('/can-review/:productId', authMiddleware, asyncHandler(async (req, res) => {
    try {
        const userID = req.user._id;
        const productId = req.params.productId;

        // Check if already reviewed
        const existingReview = await Review.findOne({ productID: productId, userID });
        if (existingReview) {
            return res.json({
                success: true,
                data: { canReview: false, reason: 'already_reviewed', existingReview }
            });
        }

        // Check if user has a delivered order with this product
        const order = await Order.findOne({
            userID,
            'items.productID': productId,
            orderStatus: { $in: ['delivered', 'shipped'] }
        }).select('_id');

        if (!order) {
            return res.json({
                success: true,
                data: { canReview: false, reason: 'not_purchased' }
            });
        }

        res.json({
            success: true,
            data: { canReview: true, orderId: order._id }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

module.exports = router;
