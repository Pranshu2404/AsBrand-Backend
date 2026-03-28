const mongoose = require('mongoose');

const supplierProductSchema = new mongoose.Schema({
    supplierId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    // The supplier's specific price
    price: {
        type: Number,
        required: true
    },
    offerPrice: {
        type: Number
    },
    // The supplier's specific stock
    quantity: {
        type: Number,
        required: true,
        default: 0
    },
    stockStatus: {
        type: String,
        enum: ['in_stock', 'out_of_stock', 'low_stock', 'pre_order'],
        default: 'in_stock'
    },
    // Keep supplier's own SKUs/Variants if they differ or have custom prices/images
    skus: [{
        skuId: { type: String, trim: true },
        attributes: { type: Map, of: String },
        stock: { type: Number, default: 0 },
        price: { type: Number },
        images: [{ type: String }]
    }],
    isActive: {
        type: Boolean,
        default: true
    },
    isApproved: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

// Auto-update stock status based on quantity
supplierProductSchema.pre('save', function (next) {
    if (this.quantity <= 0) {
        this.stockStatus = 'out_of_stock';
    } else if (this.stockStatus === 'out_of_stock' || this.stockStatus === 'low_stock') {
        this.stockStatus = 'in_stock';
    }
    next();
});

// Ensure a supplier can't map to the exact same base product multiple times
supplierProductSchema.index({ supplierId: 1, productId: 1 }, { unique: true });

const SupplierProduct = mongoose.model('SupplierProduct', supplierProductSchema);

module.exports = SupplierProduct;
