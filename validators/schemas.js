const Joi = require('joi');

// ==================== USER SCHEMAS ====================

const registerSchema = Joi.object({
    name: Joi.string()
        .min(2)
        .max(50)
        .required()
        .messages({
            'string.min': 'Name must be at least 2 characters',
            'string.max': 'Name cannot exceed 50 characters',
            'any.required': 'Name is required'
        }),
    email: Joi.string()
        .email()
        .required()
        .messages({
            'string.email': 'Please provide a valid email',
            'any.required': 'Email is required'
        }),
    phone: Joi.string()
        .pattern(/^[6-9]\d{9}$/)
        .required()
        .messages({
            'string.pattern.base': 'Please provide a valid 10-digit Indian phone number',
            'any.required': 'Phone is required'
        }),
    password: Joi.string()
        .min(6)
        .max(30)
        .required()
        .messages({
            'string.min': 'Password must be at least 6 characters',
            'any.required': 'Password is required'
        })
});

const loginSchema = Joi.object({
    email: Joi.string()
        .email()
        .required()
        .messages({
            'string.email': 'Please provide a valid email',
            'any.required': 'Email is required'
        }),
    password: Joi.string()
        .required()
        .messages({
            'any.required': 'Password is required'
        })
});

// ==================== ORDER SCHEMAS ====================

const createOrderSchema = Joi.object({
    orderStatus: Joi.string()
        .valid('pending', 'processing', 'shipped', 'delivered', 'cancelled')
        .default('pending'),
    items: Joi.array()
        .items(Joi.object({
            productID: Joi.string().required(),
            productName: Joi.string().required(),
            quantity: Joi.number().integer().min(1).required(),
            price: Joi.number().positive().required(),
            variant: Joi.string().allow('', null)
        }))
        .min(1)
        .required()
        .messages({
            'array.min': 'At least one item is required',
            'any.required': 'Items are required'
        }),
    totalPrice: Joi.number()
        .positive()
        .required(),
    shippingAddress: Joi.object({
        phone: Joi.string().required(),
        street: Joi.string().required(),
        city: Joi.string().required(),
        state: Joi.string().required(),
        postalCode: Joi.string().required(),
        country: Joi.string().default('India')
    }).required(),
    paymentMethod: Joi.string()
        .valid('cod', 'prepaid')
        .required(),
    couponCode: Joi.string().allow('', null),
    orderTotal: Joi.object({
        subtotal: Joi.number().required(),
        discount: Joi.number().default(0),
        total: Joi.number().required()
    }).required(),
    trackingUrl: Joi.string().uri().allow('', null)
});

const updateOrderSchema = Joi.object({
    orderStatus: Joi.string()
        .valid('pending', 'processing', 'shipped', 'delivered', 'cancelled')
        .required(),
    trackingUrl: Joi.string().uri().allow('', null)
});

// ==================== EMI SCHEMAS ====================

const createEmiPlanSchema = Joi.object({
    name: Joi.string().required(),
    tenure: Joi.number()
        .valid(3, 6, 9, 12, 18, 24)
        .required()
        .messages({
            'any.only': 'Tenure must be 3, 6, 9, 12, 18, or 24 months'
        }),
    interestRate: Joi.number().min(0).default(0),
    processingFee: Joi.number().min(0).default(0),
    minOrderAmount: Joi.number().positive().required(),
    maxOrderAmount: Joi.number().positive().allow(null),
    isActive: Joi.boolean().default(true),
    applicableCategories: Joi.array().items(Joi.string()),
    bankPartners: Joi.array().items(Joi.object({
        bankName: Joi.string().required(),
        cardType: Joi.string().valid('credit', 'debit', 'both').required()
    }))
});

const applyEmiSchema = Joi.object({
    orderId: Joi.string()
        .required()
        .messages({
            'any.required': 'Order ID is required'
        }),
    emiPlanId: Joi.string()
        .required()
        .messages({
            'any.required': 'EMI Plan ID is required'
        }),
    principalAmount: Joi.number()
        .positive()
        .required()
        .messages({
            'number.positive': 'Principal amount must be positive',
            'any.required': 'Principal amount is required'
        })
});

const payInstallmentSchema = Joi.object({
    transactionId: Joi.string().required(),
    paymentMethod: Joi.string()
        .valid('upi', 'card', 'netbanking', 'wallet')
        .required()
});

// ==================== KYC SCHEMAS ====================

const submitKycSchema = Joi.object({
    fullName: Joi.string().min(2).max(100).required(),
    dateOfBirth: Joi.date().max('now').required(),
    gender: Joi.string().valid('male', 'female', 'other'),
    panNumber: Joi.string()
        .pattern(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/)
        .messages({
            'string.pattern.base': 'Invalid PAN format. Example: ABCDE1234F'
        }),
    aadhaarNumber: Joi.string()
        .pattern(/^\d{12}$/)
        .messages({
            'string.pattern.base': 'Aadhaar must be 12 digits'
        }),
    email: Joi.string().email().required(),
    phone: Joi.string().pattern(/^[6-9]\d{9}$/).required(),
    address: Joi.object({
        street: Joi.string().required(),
        city: Joi.string().required(),
        state: Joi.string().required(),
        pincode: Joi.string().pattern(/^\d{6}$/).required(),
        country: Joi.string().default('India')
    }).required(),
    bankDetails: Joi.object({
        accountHolderName: Joi.string(),
        accountNumber: Joi.string(),
        ifscCode: Joi.string().pattern(/^[A-Z]{4}0[A-Z0-9]{6}$/),
        bankName: Joi.string(),
        upiId: Joi.string()
    })
});

const verifyKycSchema = Joi.object({
    status: Joi.string()
        .valid('verified', 'rejected')
        .required(),
    creditLimit: Joi.number().positive().when('status', {
        is: 'verified',
        then: Joi.required()
    }),
    rejectionReason: Joi.string().when('status', {
        is: 'rejected',
        then: Joi.required()
    })
});

// ==================== PAYMENT SCHEMAS ====================

const stripePaymentSchema = Joi.object({
    email: Joi.string().email().required(),
    name: Joi.string().required(),
    address: Joi.object({
        line1: Joi.string().required(),
        city: Joi.string().required(),
        state: Joi.string().required(),
        postal_code: Joi.string().required(),
        country: Joi.string().default('IN')
    }).required(),
    amount: Joi.number().integer().positive().required()
        .messages({
            'number.positive': 'Amount must be positive (in paisa)'
        }),
    currency: Joi.string().default('inr'),
    description: Joi.string().required()
});

// ==================== COMMON SCHEMAS ====================

const mongoIdSchema = Joi.object({
    id: Joi.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required()
        .messages({
            'string.pattern.base': 'Invalid ID format'
        })
});

module.exports = {
    // User
    registerSchema,
    loginSchema,
    // Order
    createOrderSchema,
    updateOrderSchema,
    // EMI
    createEmiPlanSchema,
    applyEmiSchema,
    payInstallmentSchema,
    // KYC
    submitKycSchema,
    verifyKycSchema,
    // Payment
    stripePaymentSchema,
    // Common
    mongoIdSchema
};
