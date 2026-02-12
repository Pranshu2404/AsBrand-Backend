const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
    productID: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: [true, 'Product ID is required']
    },
    userID: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'User ID is required']
    },
    orderID: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: [true, 'Order ID is required']
    },

    // Rating & Content
    rating: {
        type: Number,
        required: [true, 'Rating is required'],
        min: 1,
        max: 5
    },
    title: {
        type: String,
        trim: true,
        maxlength: 100
    },
    comment: {
        type: String,
        trim: true,
        maxlength: 1000
    },

    // Review images (Cloudinary URLs)
    images: [{
        url: {
            type: String,
            required: true
        },
        publicId: {
            type: String  // Cloudinary public_id for deletion
        }
    }],

    // Verification & Moderation
    isVerifiedPurchase: {
        type: Boolean,
        default: false
    },
    isApproved: {
        type: Boolean,
        default: true  // Auto-approve for v1
    },

    // User snapshot (denormalized for display)
    userName: {
        type: String,
        trim: true
    }
}, { timestamps: true });

// One review per product per user
reviewSchema.index({ productID: 1, userID: 1 }, { unique: true });

// Fast lookups for product reviews
reviewSchema.index({ productID: 1, isApproved: 1, createdAt: -1 });

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;
