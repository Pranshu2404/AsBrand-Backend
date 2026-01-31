/**
 * Payment Reminder Cron Job
 * 
 * This cron job handles automated payment reminders and penalty application
 * for BNPL EMI payments.
 * 
 * Schedule: Runs daily at 9:00 AM IST
 * 
 * Flow:
 * 1. 3 days before due: "Keep ₹X ready in your bank"
 * 2. On due date: "EMI being processed today"
 * 3. 1 day after failure: "Payment failed. Pay manually to avoid credit impact"
 * 4. 3 days after failure: Apply late fee, end grace period
 */

const cron = require('node-cron');
const PenaltyLedger = require('../model/penaltyLedger');
const EmiApplication = require('../model/emiApplication');
const Notification = require('../model/notification');
const User = require('../model/user');

// Notification templates
const NOTIFICATION_TEMPLATES = {
    reminder_3_days: {
        title: 'EMI Due in 3 Days',
        body: 'Keep ₹{amount} ready in your bank for auto-debit on {dueDate}',
    },
    due_today: {
        title: 'EMI Payment Today',
        body: 'Your EMI of ₹{amount} will be auto-debited today',
    },
    payment_failed: {
        title: 'Payment Failed',
        body: 'EMI of ₹{amount} failed. Pay manually within 3 days to avoid penalty',
    },
    overdue_1_day: {
        title: 'Payment Overdue',
        body: 'Your EMI is overdue. Pay ₹{amount} now to avoid credit score impact',
    },
    overdue_grace_ended: {
        title: 'Grace Period Ended',
        body: 'Late fee of ₹{penalty} applied. Pay ₹{totalAmount} now to close',
    },
    penalty_applied: {
        title: 'Penalty Applied',
        body: 'Daily penalty of 0.1% is being applied. Current penalty: ₹{penalty}',
    }
};

/**
 * Send notification to user
 */
async function sendNotification(userId, type, data) {
    try {
        const template = NOTIFICATION_TEMPLATES[type];
        if (!template) return;

        // Replace placeholders in template
        let title = template.title;
        let body = template.body;

        Object.keys(data).forEach(key => {
            title = title.replace(`{${key}}`, data[key]);
            body = body.replace(`{${key}}`, data[key]);
        });

        // Create notification record
        const notification = new Notification({
            userId,
            title,
            description: body,
            type: 'payment_reminder',
            isRead: false,
        });
        await notification.save();

        // TODO: Add FCM/Push notification
        // TODO: Add WhatsApp notification via API
        // TODO: Add SMS notification

        console.log(`📧 Sent ${type} notification to user ${userId}`);
        return { success: true, type };
    } catch (error) {
        console.error(`Failed to send notification: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Process upcoming EMIs (3 days before due date)
 */
async function processUpcomingReminders() {
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    threeDaysFromNow.setHours(0, 0, 0, 0);

    const nextDay = new Date(threeDaysFromNow);
    nextDay.setDate(nextDay.getDate() + 1);

    const upcomingEmis = await EmiApplication.find({
        status: 'active',
        nextDueDate: {
            $gte: threeDaysFromNow,
            $lt: nextDay
        }
    }).populate('userId');

    console.log(`🔔 Found ${upcomingEmis.length} EMIs due in 3 days`);

    for (const emi of upcomingEmis) {
        // Check if we already sent this reminder
        const existingLedger = await PenaltyLedger.findOne({
            emiApplicationId: emi._id,
            dueDate: emi.nextDueDate,
            'notifications.type': 'reminder_3_days'
        });

        if (existingLedger) continue;

        // Create or update penalty ledger entry
        let ledger = await PenaltyLedger.findOne({
            emiApplicationId: emi._id,
            dueDate: emi.nextDueDate
        });

        if (!ledger) {
            ledger = new PenaltyLedger({
                emiApplicationId: emi._id,
                userId: emi.userId._id || emi.userId,
                installmentNo: emi.paidInstallments + 1,
                originalAmount: emi.monthlyEmi,
                dueDate: emi.nextDueDate,
                status: 'pending'
            });
        }

        await sendNotification(emi.userId._id || emi.userId, 'reminder_3_days', {
            amount: emi.monthlyEmi.toLocaleString('en-IN'),
            dueDate: new Date(emi.nextDueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
        });

        ledger.notifications.push({
            type: 'reminder_3_days',
            sentAt: new Date(),
            channel: 'push',
            status: 'sent'
        });

        await ledger.save();
    }
}

/**
 * Process due date reminders
 */
async function processDueDateReminders() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dueToday = await EmiApplication.find({
        status: 'active',
        nextDueDate: {
            $gte: today,
            $lt: tomorrow
        }
    });

    console.log(`💳 Found ${dueToday.length} EMIs due today`);

    for (const emi of dueToday) {
        const ledger = await PenaltyLedger.findOne({
            emiApplicationId: emi._id,
            dueDate: emi.nextDueDate
        });

        if (ledger && ledger.notifications.some(n => n.type === 'due_today')) continue;

        await sendNotification(emi.userId, 'due_today', {
            amount: emi.monthlyEmi.toLocaleString('en-IN')
        });

        if (ledger) {
            ledger.notifications.push({
                type: 'due_today',
                sentAt: new Date(),
                channel: 'push',
                status: 'sent'
            });
            await ledger.save();
        }
    }
}

/**
 * Process overdue EMIs and apply penalties
 */
async function processOverdueEmis() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find all pending penalty entries
    const overdueLedgers = await PenaltyLedger.find({
        dueDate: { $lt: today },
        status: { $in: ['pending', 'grace_period', 'overdue'] }
    }).populate('emiApplicationId');

    console.log(`⚠️ Processing ${overdueLedgers.length} overdue EMIs`);

    for (const ledger of overdueLedgers) {
        const dueDate = new Date(ledger.dueDate);
        const daysSinceDue = Math.floor((today - dueDate) / (24 * 60 * 60 * 1000));

        // Day 1 after due date
        if (daysSinceDue === 1 && !ledger.notifications.some(n => n.type === 'overdue_1_day')) {
            ledger.status = 'grace_period';

            await sendNotification(ledger.userId, 'overdue_1_day', {
                amount: ledger.originalAmount.toLocaleString('en-IN')
            });

            ledger.notifications.push({
                type: 'overdue_1_day',
                sentAt: new Date(),
                channel: 'push',
                status: 'sent'
            });
        }

        // Day 3+ (Grace period ends)
        if (daysSinceDue >= 3 && ledger.isInGracePeriod) {
            ledger.isInGracePeriod = false;
            ledger.status = 'overdue';
            ledger.missedDate = dueDate;

            // Calculate penalty
            ledger.calculatePenalty();

            await sendNotification(ledger.userId, 'overdue_grace_ended', {
                penalty: ledger.penaltyAmount.toLocaleString('en-IN'),
                totalAmount: ledger.totalPayable.toLocaleString('en-IN')
            });

            ledger.notifications.push({
                type: 'overdue_grace_ended',
                sentAt: new Date(),
                channel: 'push',
                status: 'sent'
            });

            // Update EMI application status
            if (ledger.emiApplicationId) {
                await EmiApplication.findByIdAndUpdate(ledger.emiApplicationId._id, {
                    status: 'defaulted'
                });
            }
        }

        // Update penalty daily for overdue entries
        if (!ledger.isInGracePeriod) {
            ledger.calculatePenalty();
        }

        await ledger.save();
    }
}

/**
 * Main cron job function
 */
async function runPaymentReminderJob() {
    console.log('🕘 Running payment reminder cron job...');
    const startTime = Date.now();

    try {
        await processUpcomingReminders();
        await processDueDateReminders();
        await processOverdueEmis();

        const duration = Date.now() - startTime;
        console.log(`✅ Payment reminder job completed in ${duration}ms`);
    } catch (error) {
        console.error('❌ Payment reminder job failed:', error.message);
    }
}

/**
 * Initialize cron job
 * Runs daily at 9:00 AM IST (3:30 AM UTC)
 */
function initPaymentReminderCron() {
    // Schedule: 0 9 * * * (9:00 AM every day)
    // For IST, we use 3:30 UTC
    cron.schedule('30 3 * * *', runPaymentReminderJob, {
        timezone: 'Asia/Kolkata'
    });

    console.log('📅 Payment reminder cron job scheduled (Daily 9:00 AM IST)');
}

module.exports = {
    initPaymentReminderCron,
    runPaymentReminderJob, // Export for manual testing
    processUpcomingReminders,
    processDueDateReminders,
    processOverdueEmis
};
