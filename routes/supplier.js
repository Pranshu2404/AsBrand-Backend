const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const User = require('../model/user');
const Product = require('../model/product');
const Order = require('../model/order');
const { authMiddleware, adminMiddleware, supplierMiddleware } = require('../middleware/auth.middleware');
const { uploadProduct } = require('../uploadFile');

// Generate a fresh JWT with updated role
const generateToken = (user) => {
    return jwt.sign(
        { id: user._id, email: user.email, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );
};

// ============================================================
// SUPPLIER REGISTRATION
// ============================================================

// POST /supplier/register — Apply to become a supplier
router.post('/register', authMiddleware, asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id);

    if (!user) {
        return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (user.role === 'supplier') {
        return res.status(400).json({ success: false, message: 'You are already a supplier.' });
    }

    if (user.role === 'admin') {
        return res.status(400).json({ success: false, message: 'Admin cannot register as supplier.' });
    }

    const { storeName, gstin, pickupAddress, bankDetails } = req.body;

    if (!storeName || !pickupAddress || !pickupAddress.address || !pickupAddress.city || !pickupAddress.state || !pickupAddress.pincode) {
        return res.status(400).json({ success: false, message: 'Store name and pickup address are required.' });
    }

    // Update user to supplier
    user.role = 'supplier';
    user.supplierProfile = {
        storeName,
        gstin: gstin || '',
        pickupAddress,
        bankDetails: bankDetails || {},
        isApproved: false, // requires admin approval
        supplierSince: new Date()
    };

    await user.save();

    res.json({
        success: true,
        message: 'Application submitted! Your account is under review.',
        data: {
            token: generateToken(user), // Fresh token with role: 'supplier'
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                supplierProfile: user.supplierProfile
            }
        }
    });
}));

// ============================================================
// SUPPLIER PROFILE
// ============================================================

// GET /supplier/profile
router.get('/profile', authMiddleware, supplierMiddleware, asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).select('-password -otp -otpExpiry');
    if (!user) {
        return res.status(404).json({ success: false, message: 'User not found.' });
    }
    res.json({ success: true, data: user });
}));

// PUT /supplier/profile
router.put('/profile', authMiddleware, supplierMiddleware, asyncHandler(async (req, res) => {
    const { storeName, gstin, pickupAddress, bankDetails } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
        return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (storeName) user.supplierProfile.storeName = storeName;
    if (gstin) user.supplierProfile.gstin = gstin;
    if (pickupAddress) user.supplierProfile.pickupAddress = pickupAddress;
    if (bankDetails) user.supplierProfile.bankDetails = bankDetails;

    await user.save();

    res.json({
        success: true,
        message: 'Supplier profile updated.',
        data: { supplierProfile: user.supplierProfile }
    });
}));

// ============================================================
// SUPPLIER DASHBOARD
// ============================================================

// GET /supplier/dashboard
router.get('/dashboard', authMiddleware, supplierMiddleware, asyncHandler(async (req, res) => {
    const supplierId = req.user.id;

    // Total products by this supplier
    const totalProducts = await Product.countDocuments({ supplierId });
    const activeProducts = await Product.countDocuments({ supplierId, isActive: true });

    // Orders containing this supplier's products
    const supplierProductIds = await Product.find({ supplierId }).select('_id');
    const productIds = supplierProductIds.map(p => p._id);

    const orders = await Order.find({
        'items.productID': { $in: productIds }
    });

    let totalRevenue = 0;
    let totalOrderItems = 0;

    orders.forEach(order => {
        order.items.forEach(item => {
            if (productIds.some(pid => pid.equals(item.productID))) {
                totalRevenue += (item.price || 0) * (item.quantity || 1);
                totalOrderItems++;
            }
        });
    });

    res.json({
        success: true,
        data: {
            totalProducts,
            activeProducts,
            totalOrders: orders.length,
            totalOrderItems,
            totalRevenue: Math.round(totalRevenue),
            pendingOrders: orders.filter(o => o.orderStatus === 'pending' || o.orderStatus === 'processing').length
        }
    });
}));

// ============================================================
// SUPPLIER PRODUCTS
// ============================================================

// GET /supplier/products — List supplier's own products
router.get('/products', authMiddleware, supplierMiddleware, asyncHandler(async (req, res) => {
    const products = await Product.find({ supplierId: req.user.id })
        .populate('proCategoryId', 'id name')
        .populate('proSubCategoryId', 'id name')
        .populate('proBrandId', 'id name')
        .sort({ createdAt: -1 });

    res.json({ success: true, data: products });
}));

// POST /supplier/products — Add a new product
router.post('/products', authMiddleware, supplierMiddleware, asyncHandler(async (req, res) => {
    try {
        const isJson = (req.headers['content-type'] || '').includes('application/json');

        // Helper to create product from parsed body
        async function createProduct(body, files) {
            const {
                name, description, quantity, price, offerPrice,
                proCategoryId, proSubCategoryId, proBrandId,
                proVariantTypeId, proVariantId, proVariants,
                gender, material, fit, pattern, sleeveLength, neckline, occasion,
                careInstructions, tags, specifications, weight, dimensions,
                preUploadedUrls
            } = body;

            if (!name || !quantity || !price || !proCategoryId || !proSubCategoryId) {
                return res.status(400).json({ success: false, message: 'Required fields: name, quantity, price, category, subcategory.' });
            }

            // Parse JSON strings where needed
            let parsedDimensions = dimensions;
            if (typeof dimensions === 'string') {
                try { parsedDimensions = JSON.parse(dimensions); } catch (e) { parsedDimensions = {}; }
            }
            let parsedTags = tags;
            if (typeof tags === 'string') {
                try { parsedTags = JSON.parse(tags); } catch (e) { parsedTags = []; }
            }
            let parsedSpecs = specifications;
            if (typeof specifications === 'string') {
                try { parsedSpecs = JSON.parse(specifications); } catch (e) { parsedSpecs = []; }
            }
            let parsedProVariants = proVariants;
            if (typeof proVariants === 'string') {
                try { parsedProVariants = JSON.parse(proVariants); } catch (e) { parsedProVariants = []; }
            }

            // Parse pre-uploaded URLs
            let parsedPreUploadedUrls = [];
            if (preUploadedUrls) {
                if (typeof preUploadedUrls === 'string') {
                    try { parsedPreUploadedUrls = JSON.parse(preUploadedUrls); } catch (e) { parsedPreUploadedUrls = []; }
                } else if (Array.isArray(preUploadedUrls)) {
                    parsedPreUploadedUrls = preUploadedUrls;
                }
            }

            // Build image list
            const imageList = [];
            if (Array.isArray(parsedPreUploadedUrls) && parsedPreUploadedUrls.length > 0) {
                parsedPreUploadedUrls.forEach((item, index) => {
                    if (typeof item === 'string') {
                        imageList.push({ image: index + 1, url: item });
                    } else if (item && item.url) {
                        imageList.push({ image: item.image || index + 1, url: item.url });
                    }
                });
            } else if (files) {
                ['image1', 'image2', 'image3', 'image4', 'image5'].forEach((field, index) => {
                    if (files[field] && files[field][0]) {
                        imageList.push({ image: index + 1, url: files[field][0].path });
                    }
                });
            }

            const newProduct = new Product({
                name, description,
                quantity: parseInt(quantity),
                price: parseFloat(price),
                offerPrice: offerPrice ? parseFloat(offerPrice) : undefined,
                proCategoryId, proSubCategoryId, proBrandId,
                proVariantTypeId, proVariantId,
                proVariants: parsedProVariants || [],
                gender: gender || 'Unisex',
                material, fit, pattern, sleeveLength, neckline, occasion,
                careInstructions,
                tags: parsedTags || [],
                specifications: parsedSpecs || [],
                weight: weight ? parseFloat(weight) : 0,
                dimensions: parsedDimensions || {},
                images: imageList,
                supplierId: req.user.id,
                isApproved: false
            });

            await newProduct.save();
            res.json({ success: true, message: 'Product submitted for review.', data: newProduct });
        }

        if (isJson) {
            // JSON body with pre-uploaded Cloudinary URLs — no multer needed
            await createProduct(req.body, null);
        } else {
            // Multipart form-data — use multer
            uploadProduct.fields([
                { name: 'image1', maxCount: 1 },
                { name: 'image2', maxCount: 1 },
                { name: 'image3', maxCount: 1 },
                { name: 'image4', maxCount: 1 },
                { name: 'image5', maxCount: 1 }
            ])(req, res, async function (err) {
                if (err instanceof multer.MulterError) {
                    return res.status(400).json({ success: false, message: err.message });
                }
                if (err) {
                    return res.status(500).json({ success: false, message: 'Upload error.' });
                }
                await createProduct(req.body, req.files);
            });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

// PUT /supplier/products/:id — Update own product
router.put('/products/:id', authMiddleware, supplierMiddleware, asyncHandler(async (req, res) => {
    const product = await Product.findOne({ _id: req.params.id, supplierId: req.user.id });

    if (!product) {
        return res.status(404).json({ success: false, message: 'Product not found or not yours.' });
    }

    const allowedFields = [
        'name', 'description', 'quantity', 'price', 'offerPrice',
        'proCategoryId', 'proSubCategoryId', 'proBrandId',
        'gender', 'material', 'fit', 'pattern', 'sleeveLength', 'neckline', 'occasion',
        'careInstructions', 'tags', 'specifications', 'weight', 'dimensions',
        'isActive', 'featured'
    ];

    allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
            product[field] = req.body[field];
        }
    });

    await product.save();
    res.json({ success: true, message: 'Product updated.', data: product });
}));

// DELETE /supplier/products/:id — Delete own product
router.delete('/products/:id', authMiddleware, supplierMiddleware, asyncHandler(async (req, res) => {
    const product = await Product.findOneAndDelete({ _id: req.params.id, supplierId: req.user.id });

    if (!product) {
        return res.status(404).json({ success: false, message: 'Product not found or not yours.' });
    }

    res.json({ success: true, message: 'Product deleted.' });
}));

// ============================================================
// SUPPLIER ORDERS
// ============================================================

// GET /supplier/orders — Orders containing supplier's products
router.get('/orders', authMiddleware, supplierMiddleware, asyncHandler(async (req, res) => {
    const supplierProductIds = await Product.find({ supplierId: req.user.id }).select('_id');
    const productIds = supplierProductIds.map(p => p._id);

    const orders = await Order.find({
        'items.productID': { $in: productIds }
    })
        .populate('userID', 'name email phone')
        .sort({ createdAt: -1 });

    // Filter each order to only include this supplier's items
    const supplierOrders = orders.map(order => {
        const orderObj = order.toObject();
        orderObj.items = orderObj.items.filter(item =>
            productIds.some(pid => pid.equals(item.productID))
        );
        return orderObj;
    });

    res.json({ success: true, data: supplierOrders });
}));

// ============================================================
// ADMIN — SUPPLIER MANAGEMENT (no auth — admin panel handles its own login)
// ============================================================

// GET /supplier/admin/pending — List all suppliers (pending first)
router.get('/admin/pending', asyncHandler(async (req, res) => {
    const suppliers = await User.find({ role: 'supplier' })
        .select('-password -otp -otpExpiry')
        .sort({ 'supplierProfile.isApproved': 1, createdAt: -1 }); // pending first

    res.json({
        success: true,
        data: suppliers,
        stats: {
            total: suppliers.length,
            pending: suppliers.filter(s => !s.supplierProfile?.isApproved).length,
            approved: suppliers.filter(s => s.supplierProfile?.isApproved).length,
        }
    });
}));

// PUT /supplier/admin/approve/:userId — Approve a supplier
router.put('/admin/approve/:userId', asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.userId);

    if (!user || user.role !== 'supplier') {
        return res.status(404).json({ success: false, message: 'Supplier not found.' });
    }

    if (user.supplierProfile.isApproved) {
        return res.status(400).json({ success: false, message: 'Supplier is already approved.' });
    }

    user.supplierProfile.isApproved = true;
    await user.save();

    res.json({
        success: true,
        message: `Supplier "${user.supplierProfile.storeName}" has been approved.`,
        data: { id: user._id, storeName: user.supplierProfile.storeName }
    });
}));

// PUT /supplier/admin/reject/:userId — Reject / revoke supplier
router.put('/admin/reject/:userId', asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.userId);

    if (!user || user.role !== 'supplier') {
        return res.status(404).json({ success: false, message: 'Supplier not found.' });
    }

    // Revert to regular user
    user.role = 'user';
    user.supplierProfile = undefined;
    await user.save();

    res.json({
        success: true,
        message: `Supplier "${user.name}" has been rejected and reverted to user.`,
    });
}));

// ============================================================
// ADMIN — PRODUCT APPROVAL
// ============================================================

// GET /supplier/admin/products — List all supplier products (unapproved first)
router.get('/admin/products', asyncHandler(async (req, res) => {
    const products = await Product.find({ supplierId: { $ne: null } })
        .populate('supplierId', 'name email supplierProfile.storeName')
        .populate('proCategoryId', 'name')
        .populate('proSubCategoryId', 'name')
        .sort({ isApproved: 1, createdAt: -1 }); // unapproved first

    const pending = products.filter(p => !p.isApproved);
    const approved = products.filter(p => p.isApproved);

    res.json({
        success: true,
        data: products,
        stats: {
            total: products.length,
            pending: pending.length,
            approved: approved.length,
        }
    });
}));

// PUT /supplier/admin/products/approve/:productId — Approve a product
router.put('/admin/products/approve/:productId', asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.productId);

    if (!product) {
        return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    product.isApproved = true;
    await product.save();

    res.json({
        success: true,
        message: `Product "${product.name}" has been approved.`,
    });
}));

// PUT /supplier/admin/products/reject/:productId — Reject a product
router.put('/admin/products/reject/:productId', asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.productId);

    if (!product) {
        return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    // Remove the product entirely
    await Product.findByIdAndDelete(req.params.productId);

    res.json({
        success: true,
        message: `Product "${product.name}" has been rejected and removed.`,
    });
}));

module.exports = router;
