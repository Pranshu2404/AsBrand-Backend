const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    // Basic Info
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    // sku: {
    //     type: String,
    //     unique: true,
    //     sparse: true,
    //     trim: true
    // },

    // Pricing
    price: {
        type: Number,
        required: true
    },
    offerPrice: {
        type: Number
    },
    discountPercentage: {
        type: Number,
        default: 0
    },
    emiEligible: {
        type: Boolean,
        default: true
    },

    // Inventory
    quantity: {
        type: Number,
        required: true
    },
    stockStatus: {
        type: String,
        enum: ['in_stock', 'out_of_stock', 'low_stock', 'pre_order'],
        default: 'in_stock'
    },
    lowStockThreshold: {
        type: Number,
        default: 10
    },

    // Shipping
    weight: {
        type: Number, // in grams
        default: 0
    },
    dimensions: {
        length: { type: Number, default: 0 },
        width: { type: Number, default: 0 },
        height: { type: Number, default: 0 }
    },

    // Categories & References
    gender: {
        type: String,
        enum: ['Men', 'Women', 'Kids', 'Unisex', 'Boys', 'Girls'],
        default: 'Unisex'
    },
    material: {
        type: String,
        trim: true
    },
    fit: {
        type: String,
        enum: ['Regular Fit', 'Slim Fit', 'Relaxed Fit', 'Oversized', 'Skinny Fit'],
        trim: true
    },
    pattern: {
        type: String,
        enum: ['Solid', 'Striped', 'Printed', 'Checked', 'Self Design', 'Graphic', 'Floral', 'Polka Dots'],
        trim: true
    },
    sleeveLength: {
        type: String,
        enum: ['Full Sleeve', 'Half Sleeve', 'Sleeveless', '3/4 Sleeve', 'Roll-up Sleeve'],
        trim: true
    },
    neckline: {
        type: String,
        enum: ['Round Neck', 'V-Neck', 'Collar', 'Mandarin Collar', 'Crew Neck', 'Polo', 'Scoop Neck'],
        trim: true
    },
    occasion: {
        type: String,
        enum: ['Casual', 'Formal', 'Party', 'Sports', 'Ethnic', 'Lounge', 'Workwear'],
        trim: true
    },
    careInstructions: {
        type: String,
        trim: true
    },
    proCategoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        required: true
    },
    proSubCategoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SubCategory',
        required: true
    },
    proBrandId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Brand'
    },
    proVariantTypeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'VariantType'
    },
    proVariantId: [String],
    // New: grouped variant types with their items
    proVariants: [{
        variantTypeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'VariantType'
        },
        variantTypeName: { type: String, trim: true },
        items: [String]
    }],

    // Product Details
    tags: [{
        type: String,
        trim: true
    }],
    specifications: [{
        key: { type: String, trim: true },
        value: { type: String, trim: true }
    }],
    warranty: {
        type: String,
        trim: true
    },

    // Flags
    featured: {
        type: Boolean,
        default: false
    },
    isActive: {
        type: Boolean,
        default: true
    },

    // SEO
    metaTitle: {
        type: String,
        trim: true
    },
    metaDescription: {
        type: String,
        trim: true
    },

    // Media
    images: [{
        image: {
            type: Number,
            required: true
        },
        url: {
            type: String,
            required: true
        }
    }]
}, { timestamps: true });

// Auto-update stock status based on quantity
productSchema.pre('save', function (next) {
    if (this.quantity <= 0) {
        this.stockStatus = 'out_of_stock';
    } else if (this.quantity <= this.lowStockThreshold) {
        this.stockStatus = 'low_stock';
    } else if (this.stockStatus === 'out_of_stock' || this.stockStatus === 'low_stock') {
        this.stockStatus = 'in_stock';
    }
    next();
});

// Pre-save hook to calculate discount percentage
productSchema.pre('save', function (next) {
    if (this.offerPrice && this.price > this.offerPrice) {
        this.discountPercentage = Math.round(((this.price - this.offerPrice) / this.price) * 100);
    } else {
        this.discountPercentage = 0;
    }
    next();
});

const Product = mongoose.model('Product', productSchema);

module.exports = Product;

