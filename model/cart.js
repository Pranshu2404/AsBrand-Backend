const mongoose = require('mongoose');

const cartSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    items: [{
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        quantity: {
            type: Number,
            required: true,
            default: 1,
            min: 1
        },
        emiMonths: {
            type: Number,
            default: 3
        }
    }]
}, { timestamps: true });

module.exports = mongoose.model('Cart', cartSchema);
