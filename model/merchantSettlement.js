const mongoose = require('mongoose');

const merchantSettlementSchema = new mongoose.Schema({
    // Merchant reference
    merchantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    // Order reference
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: true
    },

    // EMI Application (if applicable)
    emiApplicationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'EmiApplication'
    },

    // Transaction amounts
    totalPrice: {
        type: Number,
        required: true
    },

    // Processing fee charged to customer
    processingFee: {
        type: Number,
        default: 0
    },

    // Merchant discount (subvention) - what merchant pays for 0% EMI
    merchantDiscount: {
        type: Number,
        default: 0
    },

    // Platform fee (our commission)
    platformFee: {
        type: Number,
        default: 0
    },

    // Net settlement = totalPrice - platformFee - processingFee
    netSettlement: {
        type: Number,
        required: true
    },

    // Settlement status
    status: {
        type: String,
        enum: ['pending', 'processing', 'settled', 'refunded', 'disputed'],
        default: 'pending'
    },

    // Payment cycle
    settlementDate: {
        type: Date
    },

    // Bank transfer details
    transferDetails: {
        utr: String,
        bankAccountLast4: String,
        ifsc: String,
        transferredAt: Date
    },

    // Refund details (if applicable)
    refund: {
        isRefunded: { type: Boolean, default: false },
        refundAmount: Number,
        refundReason: String,
        refundDate: Date,
        mandateCancelled: { type: Boolean, default: false }
    },

    // Additional metadata
    notes: String

}, { timestamps: true });

// Calculate net settlement before saving
merchantSettlementSchema.pre('save', function (next) {
    if (this.isModified('totalPrice') || this.isModified('platformFee') || this.isModified('processingFee')) {
        this.netSettlement = this.totalPrice - this.platformFee - this.processingFee;
    }
    next();
});

// Static method to get settlement summary for a merchant
merchantSettlementSchema.statics.getMerchantSummary = async function (merchantId, startDate, endDate) {
    const match = { merchantId: new mongoose.Types.ObjectId(merchantId) };

    if (startDate && endDate) {
        match.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    return this.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 },
                totalAmount: { $sum: '$totalPrice' },
                totalSettlement: { $sum: '$netSettlement' },
                totalPlatformFee: { $sum: '$platformFee' },
                totalRefunds: { $sum: { $cond: ['$refund.isRefunded', '$refund.refundAmount', 0] } }
            }
        }
    ]);
};

// Indexes
merchantSettlementSchema.index({ merchantId: 1, status: 1 });
merchantSettlementSchema.index({ orderId: 1 });
merchantSettlementSchema.index({ createdAt: -1 });

module.exports = mongoose.model('MerchantSettlement', merchantSettlementSchema);
