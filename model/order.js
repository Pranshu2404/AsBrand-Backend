const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  userID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  orderDate: {
    type: Date,
    default: Date.now
  },
  orderStatus: {
    type: String,
    enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending'
  },
  items: [
    {
      productID: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
      },
      productName: {
        type: String,
        required: true
      },
      quantity: {
        type: Number,
        required: true
      },
      price: {
        type: Number,
        required: true
      },
      variant: {
        type: String,
      },
    }
  ],
  totalPrice: {
    type: Number,
    required: true
  },
  shippingAddress: {
    name: String,
    phone: String,
    street: String,
    city: String,
    state: String,
    postalCode: String,
    country: String
  },

  paymentMethod: {
    type: String,
    enum: ['cod', 'prepaid', 'razorpay', 'upi', 'card', 'netbanking']
  },

  // Payment tracking fields
  paymentStatus: {
    type: String,
    enum: ['pending', 'created', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },
  razorpayOrderId: {
    type: String,
    index: true
  },
  razorpayPaymentId: {
    type: String
  },
  razorpaySignature: {
    type: String
  },

  couponCode: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Coupon'
  },
  orderTotal: {
    subtotal: Number,
    discount: Number,
    total: Number
  },
  trackingUrl: {
    type: String
  },

  // Delivery / Shipping fields
  shippingCharge: {
    type: Number,
    default: 0
  },
  deliveryStatus: {
    type: String,
    enum: ['PENDING', 'CREATED', 'SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'],
    default: 'PENDING'
  },
  deliveryPartner: {
    type: String
  },
  shipmentId: {
    type: String,
    index: true
  },
  awbCode: {
    type: String
  },
  courierName: {
    type: String
  },
  estimatedDeliveryDate: {
    type: Date
  },
}, { timestamps: true });

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
