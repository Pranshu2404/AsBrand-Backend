const express = require('express');
const asyncHandler = require('express-async-handler');
const router = express.Router();
const Address = require('../model/address');
const { authMiddleware } = require('../middleware/auth.middleware');

// Get all addresses
router.get('/', authMiddleware, asyncHandler(async (req, res) => {
    const addresses = await Address.find({ userId: req.user.id });
    res.json({ success: true, data: addresses });
}));

// Add new address
router.post('/add', authMiddleware, asyncHandler(async (req, res) => {
    const { phone, street, city, state, pincode, isDefault } = req.body;

    // If this is the first address or set as default, unset other defaults
    if (isDefault) {
        await Address.updateMany({ userId: req.user.id }, { isDefault: false });
    } else {
        // If no address exists, make this one default
        const count = await Address.countDocuments({ userId: req.user.id });
        if (count === 0) {
            // isDefault = true; // Can't assign to const
            req.body.isDefault = true;
        }
    }

    const address = new Address({
        userId: req.user.id,
        phone,
        street,
        city,
        state,
        pincode,
        isDefault: req.body.isDefault || isDefault
    });

    await address.save();

    // Return updated list
    const addresses = await Address.find({ userId: req.user.id });
    res.json({ success: true, data: addresses });
}));

// Update address
router.put('/update/:id', authMiddleware, asyncHandler(async (req, res) => {
    const { phone, street, city, state, pincode, isDefault } = req.body;
    const addressId = req.params.id;

    const address = await Address.findOne({ _id: addressId, userId: req.user.id });

    if (!address) {
        return res.status(404).json({ success: false, message: 'Address not found' });
    }

    if (isDefault) {
        await Address.updateMany({ userId: req.user.id }, { isDefault: false });
    }

    address.phone = phone || address.phone;
    address.street = street || address.street;
    address.city = city || address.city;
    address.state = state || address.state;
    address.pincode = pincode || address.pincode;
    if (isDefault !== undefined) address.isDefault = isDefault;

    await address.save();

    const addresses = await Address.find({ userId: req.user.id });
    res.json({ success: true, data: addresses });
}));

// Delete address
router.delete('/remove/:id', authMiddleware, asyncHandler(async (req, res) => {
    const addressId = req.params.id;
    await Address.findOneAndDelete({ _id: addressId, userId: req.user.id });

    const addresses = await Address.find({ userId: req.user.id });

    // Ensure there is a default if any exist
    if (addresses.length > 0 && !addresses.some(a => a.isDefault)) {
        addresses[0].isDefault = true;
        await addresses[0].save();
    }

    res.json({ success: true, data: addresses });
}));

// Sync addresses (merge local)
router.post('/sync', authMiddleware, asyncHandler(async (req, res) => {
    const { addresses } = req.body; // Expects array of address objects

    if (addresses && Array.isArray(addresses)) {
        for (const localAddr of addresses) {
            // Logic to de-duplicate? 
            // Simple check: match street, pincode, city
            const existing = await Address.findOne({
                userId: req.user.id,
                street: localAddr.street,
                pincode: localAddr.pincode
            });

            if (!existing) {
                await Address.create({
                    userId: req.user.id,
                    phone: localAddr.phone,
                    street: localAddr.street,
                    city: localAddr.city,
                    state: localAddr.state,
                    pincode: localAddr.pincode,
                    isDefault: localAddr.isDefault
                });
            }
        }
    }

    const allAddresses = await Address.find({ userId: req.user.id });
    res.json({ success: true, data: allAddresses });
}));

module.exports = router;
