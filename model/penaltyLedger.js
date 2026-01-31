const mongoose = require('mongoose');

const penaltyLedgerSchema = new mongoose.Schema({
    // Reference to EMI Application
    emiApplicationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'EmiApplication',
        required: true
    },

    // Reference to User
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    // Installment details
    installmentNo: {
        type: Number,
        required: true
    },

    // Original EMI amount
    originalAmount: {
        type: Number,
        required: true
    },

    // Due date of the installment
    dueDate: {
        type: Date,
        required: true
    },

    // Date payment was missed
    missedDate: {
        type: Date
    },

    // Penalty calculation
    penaltyRate: {
        type: Number,
        default: 0.1 // 0.1% per day
    },

    daysOverdue: {
        type: Number,
        default: 0
    },

    // Calculated penalty amount
    penaltyAmount: {
        type: Number,
        default: 0
    },

    // Total payable = original + penalty
    totalPayable: {
        type: Number
    },

    // Grace period (in days)
    gracePeriodDays: {
        type: Number,
        default: 3
    },

    // Is still in grace period
    isInGracePeriod: {
        type: Boolean,
        default: true
    },

    // Status
    status: {
        type: String,
        enum: ['pending', 'grace_period', 'overdue', 'paid', 'waived'],
        default: 'pending'
    },

    // Payment details (when paid)
    paidAmount: {
        type: Number
    },
    paidDate: {
        type: Date
    },
    paymentReference: {
        type: String
    },

    // Waiver details (if penalty waived)
    isWaived: {
        type: Boolean,
        default: false
    },
    waiverReason: {
        type: String
    },
    waivedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },

    // Notification tracking
    notifications: [{
        type: {
            type: String,
            enum: ['reminder_3_days', 'due_today', 'payment_failed', 'overdue_1_day', 'overdue_grace_ended', 'penalty_applied']
        },
        sentAt: Date,
        channel: {
            type: String,
            enum: ['push', 'sms', 'email', 'whatsapp']
        },
        status: {
            type: String,
            enum: ['sent', 'delivered', 'failed']
        }
    }]

}, { timestamps: true });

// Calculate penalty based on days overdue
penaltyLedgerSchema.methods.calculatePenalty = function () {
    if (this.status === 'paid' || this.status === 'waived') return 0;

    const now = new Date();
    const dueDate = new Date(this.dueDate);
    const gracePeriodEnd = new Date(dueDate);
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + this.gracePeriodDays);

    // Still in grace period
    if (now <= gracePeriodEnd) {
        this.isInGracePeriod = true;
        this.daysOverdue = 0;
        this.penaltyAmount = 0;
        return 0;
    }

    // Calculate days overdue (after grace period)
    this.isInGracePeriod = false;
    const msPerDay = 24 * 60 * 60 * 1000;
    this.daysOverdue = Math.floor((now - gracePeriodEnd) / msPerDay);

    // Penalty = originalAmount * (penaltyRate/100) * daysOverdue
    this.penaltyAmount = Math.round(this.originalAmount * (this.penaltyRate / 100) * this.daysOverdue);
    this.totalPayable = this.originalAmount + this.penaltyAmount;

    return this.penaltyAmount;
};

// Static method to get overdue entries
penaltyLedgerSchema.statics.getOverdueEntries = function (userId) {
    return this.find({
        userId,
        status: { $in: ['pending', 'grace_period', 'overdue'] },
        dueDate: { $lt: new Date() }
    }).populate('emiApplicationId');
};

// Indexes
penaltyLedgerSchema.index({ userId: 1, status: 1 });
penaltyLedgerSchema.index({ dueDate: 1 });
penaltyLedgerSchema.index({ emiApplicationId: 1 });

module.exports = mongoose.model('PenaltyLedger', penaltyLedgerSchema);
