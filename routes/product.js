const express = require('express');
const router = express.Router();
const Product = require('../model/product');
const SupplierProduct = require('../model/supplierProduct');
const User = require('../model/user');
const multer = require('multer');
const { uploadProduct } = require('../uploadFile');
const asyncHandler = require('express-async-handler');

// Helper to robustly parse proVariants from FormData
// Handles: single JSON string, array of JSON strings, array of objects, array of Dart .toString() strings
function parseProVariants(raw) {
    if (!raw) return [];
    // Case 1: single JSON string like '[{"variantTypeId":"..."}]'
    if (typeof raw === 'string') {
        try { return JSON.parse(raw); } catch (e) { return []; }
    }
    // Case 2: already an array
    if (Array.isArray(raw)) {
        return raw.map(item => {
            if (typeof item === 'object' && item !== null) return item; // already parsed
            if (typeof item === 'string') {
                // Try JSON parse first
                try { return JSON.parse(item); } catch (e) { /* fall through */ }
                // Handle Dart .toString() format: {key: value, key2: value2}
                try {
                    // Convert Dart map string to JSON by quoting keys and string values
                    let fixed = item.trim();
                    if (fixed.startsWith('{') && fixed.endsWith('}')) {
                        // Extract key-value pairs manually
                        const inner = fixed.slice(1, -1);
                        const result = {};
                        // Split by top-level commas (not inside brackets)
                        let depth = 0, current = '', pairs = [];
                        for (let c of inner) {
                            if (c === '[') depth++;
                            else if (c === ']') depth--;
                            if (c === ',' && depth === 0) { pairs.push(current.trim()); current = ''; }
                            else current += c;
                        }
                        if (current.trim()) pairs.push(current.trim());
                        for (const pair of pairs) {
                            const colonIdx = pair.indexOf(':');
                            if (colonIdx === -1) continue;
                            const key = pair.slice(0, colonIdx).trim();
                            let val = pair.slice(colonIdx + 1).trim();
                            // Parse array values like [Puff Sleeve, Three-Quarter Sleeve]
                            if (val.startsWith('[') && val.endsWith(']')) {
                                val = val.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
                            }
                            result[key] = val;
                        }
                        return result;
                    }
                } catch (e) { /* ignore */ }
            }
            return null;
        }).filter(Boolean);
    }
    return [];
}

// Helper to robustly parse skus from FormData
// Expects an array of SKU objects or a JSON string resolving to an array of SKU objects
function parseSkus(raw) {
    if (!raw) return [];
    if (typeof raw === 'string') {
        try { return JSON.parse(raw); } catch (e) { return []; }
    }
    if (Array.isArray(raw)) {
        return raw.map(item => {
            if (typeof item === 'object' && item !== null) return item;
            if (typeof item === 'string') {
                try { return JSON.parse(item); } catch (e) { return null; }
            }
            return null;
        }).filter(Boolean);
    }
    return [];
}

// Get all products
router.get('/', asyncHandler(async (req, res) => {
    try {
        const { minPrice, maxPrice, sort, category, keyword, gender, brand, minDiscount, supplierId, lat, lng } = req.query;
        const userLat = lat ? parseFloat(lat) : null;
        const userLng = lng ? parseFloat(lng) : null;
        let query = { isApproved: { $ne: false } }; // Only show approved products to customers

        // Filter by Supplier Id
        if (supplierId) {
            query.supplierId = supplierId;
        }

        // Filter by Price
        if (minPrice || maxPrice) {
            query.price = {};
            if (minPrice) query.price.$gte = Number(minPrice);
            if (maxPrice) query.price.$lte = Number(maxPrice);
        }

        // Filter by Category
        if (category) {
            query.proCategoryId = category;
        }

        // Filter by Gender
        if (gender) {
            query.gender = gender;
        }

        // Filter by Brand
        if (brand) {
            // brand can be a single ID or comma separated
            const brandIds = brand.split(',');
            query.proBrandId = { $in: brandIds };
        }

        // Filter by Discount
        if (minDiscount) {
            query.discountPercentage = { $gte: Number(minDiscount) };
        }

        // Search by keyword across multiple fields
        if (keyword) {
            // Create a flexible regex that ignores spaces and hyphens
            // e.g., "tshirt" -> "t[-\s]*s[-\s]*h[-\s]*i[-\s]*r[-\s]*t"
            const sanitizedKeyword = keyword.replace(/[-\s]/g, '');
            const flexibleRegexString = sanitizedKeyword.split('').join('[-\\s]*');
            const keywordRegex = { $regex: flexibleRegexString, $options: 'i' };

            query.$or = [
                { name: keywordRegex },
                { description: keywordRegex },
                { tags: keywordRegex },
                { material: keywordRegex },
                { fit: keywordRegex },
                { pattern: keywordRegex },
                { occasion: keywordRegex },
                { gender: keywordRegex },
                { neckline: keywordRegex },
                { sleeveLength: keywordRegex },
            ];
        }

        let productsQuery = Product.find(query)
            .populate('proCategoryId', 'id name')
            .populate('proSubCategoryId', 'id name')
            .populate('proSubSubCategoryId', 'id name')
            .populate('proBrandId', 'id name')
            .populate('proVariantTypeId', 'id type')
            .populate('proVariantId', 'id name')
            .populate('proVariants.variantTypeId', 'id name type');

        // Sorting
        if (sort === 'price_asc') {
            productsQuery = productsQuery.sort({ price: 1 });
        } else if (sort === 'price_desc') {
            productsQuery = productsQuery.sort({ price: -1 });
        } else if (sort === 'newest') {
            productsQuery = productsQuery.sort({ createdAt: -1 });
        }

        let products = await productsQuery.lean();

        // Fetch all active mapped sellers for these products to compute lowest price
        const productIds = products.map(p => p._id);
        const activeMappedSellers = await SupplierProduct.find({
            productId: { $in: productIds },
            isActive: true,
            isApproved: true,
            stockStatus: { $ne: 'out_of_stock' },
            quantity: { $gt: 0 }
        }).lean();

        const sellerMap = {};
        activeMappedSellers.forEach(sp => {
            if (!sellerMap[sp.productId]) sellerMap[sp.productId] = [];
            sellerMap[sp.productId].push(sp);
        });

        // Override base product price/stock with the cheapest available seller
        products.forEach(p => {
            let bestSupplierId = p.supplierId;
            let bestPrice = p.price;
            let bestOfferPrice = p.offerPrice;
            let bestQuantity = p.quantity;
            let bestStockStatus = p.stockStatus;
            
            let baseOutOfStock = p.quantity <= 0 || p.stockStatus === 'out_of_stock';
            let lowestEffectivePrice = bestOfferPrice || bestPrice;
            if (baseOutOfStock) lowestEffectivePrice = Infinity;

            if (sellerMap[p._id]) {
                sellerMap[p._id].forEach(sp => {
                    let spEffective = sp.offerPrice || sp.price;
                    if (spEffective < lowestEffectivePrice) {
                        lowestEffectivePrice = spEffective;
                        bestSupplierId = sp.supplierId;
                        bestPrice = sp.price;
                        bestOfferPrice = sp.offerPrice;
                        bestQuantity = sp.quantity;
                        bestStockStatus = sp.stockStatus;
                    }
                });
            }

            p.supplierId = bestSupplierId;
            p.price = bestPrice;
            p.offerPrice = bestOfferPrice;
            p.quantity = bestQuantity;
            p.stockStatus = bestStockStatus;
            
            if (sellerMap[p._id] && sellerMap[p._id].length > 0) {
                p.hasOtherSellers = true;
            }
        });

        // ── Location-based filtering: only show products from suppliers within 10km ──
        if (userLat != null && userLng != null && !isNaN(userLat) && !isNaN(userLng)) {
            // Collect all unique supplier IDs from the (possibly re-assigned) products
            const supplierIds = [...new Set(products.map(p => p.supplierId?.toString()).filter(Boolean))];

            // Batch-fetch supplier pickup coordinates
            const suppliers = await User.find({ _id: { $in: supplierIds } })
                .select('_id supplierProfile.pickupAddress.latitude supplierProfile.pickupAddress.longitude')
                .lean();

            const supplierLocationMap = {};
            suppliers.forEach(s => {
                const pickupLat = s.supplierProfile?.pickupAddress?.latitude;
                const pickupLng = s.supplierProfile?.pickupAddress?.longitude;
                if (pickupLat != null && pickupLng != null) {
                    supplierLocationMap[s._id.toString()] = { lat: pickupLat, lng: pickupLng };
                }
            });

            // Haversine distance (km)
            const haversineKm = (lat1, lon1, lat2, lon2) => {
                const R = 6371;
                const dLat = (lat2 - lat1) * Math.PI / 180;
                const dLon = (lon2 - lon1) * Math.PI / 180;
                const a = Math.sin(dLat / 2) ** 2 +
                    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                    Math.sin(dLon / 2) ** 2;
                return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            };

            products = products.filter(p => {
                const sid = p.supplierId?.toString();
                // Admin products without a supplier should not be filtered out by radius
                if (!sid) return true;
                if (!supplierLocationMap[sid]) return false;
                const loc = supplierLocationMap[sid];
                return haversineKm(userLat, userLng, loc.lat, loc.lng) <= 10;
            });
        }

        res.json({ success: true, message: "Products retrieved successfully.", data: products });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

// Get a product by ID
router.get('/:id', asyncHandler(async (req, res) => {
    try {
        const productID = req.params.id;
        const product = await Product.findById(productID)
            .populate('proCategoryId', 'id name')
            .populate('proSubCategoryId', 'id name')
            .populate('proBrandId', 'id name')
            .populate('proVariantTypeId', 'id name')
            .populate('proVariantId', 'id name')
            .populate('proVariants.variantTypeId', 'id name type')
            .populate('supplierId', 'id name shopName')
            .lean();
            
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found." });
        }

        // Fetch other sellers
        const mappedSellers = await SupplierProduct.find({
            productId: productID,
            isActive: true,
            isApproved: true
        }).populate('supplierId', 'id name shopName').lean();

        let otherSellers = [];
        
        // Add the base creator as a seller option (if they are a supplier)
        if (product.supplierId) {
            otherSellers.push({
                supplierId: product.supplierId._id || product.supplierId.id,
                shopName: product.supplierId.shopName || product.supplierId.name,
                price: product.price,
                offerPrice: product.offerPrice,
                quantity: product.quantity,
                stockStatus: product.stockStatus,
                isBase: true
            });
        }
        
        // Add mapped sellers
        mappedSellers.forEach(sp => {
            if (sp.supplierId) {
                otherSellers.push({
                    supplierId: sp.supplierId._id || sp.supplierId.id,
                    shopName: sp.supplierId.shopName || sp.supplierId.name,
                    price: sp.price,
                    offerPrice: sp.offerPrice,
                    quantity: sp.quantity,
                    stockStatus: sp.stockStatus,
                    supplierProductId: sp._id,
                    isBase: false
                });
            }
        });

        // Calculate the cheapest seller to show as default
        if (otherSellers.length > 0) {
            let cheapest = otherSellers[0];
            let lowestPrice = cheapest.offerPrice || cheapest.price;
            if (cheapest.quantity <= 0) lowestPrice = Infinity;
            
            otherSellers.forEach(s => {
                let thisPrice = s.offerPrice || s.price;
                if (s.quantity > 0 && thisPrice < lowestPrice) {
                    cheapest = s;
                    lowestPrice = thisPrice;
                }
            });
            
            // Override base product fields with the cheapest seller's data
            product.supplierId = cheapest.supplierId;
            product.price = cheapest.price;
            product.offerPrice = cheapest.offerPrice;
            product.quantity = cheapest.quantity;
            product.stockStatus = cheapest.stockStatus;
        }

        product.otherSellers = otherSellers;

        res.json({ success: true, message: "Product retrieved successfully.", data: product });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));



// Upload a single product image to Cloudinary
router.post('/upload-image', asyncHandler(async (req, res) => {
    try {
        uploadProduct.single('image')(req, res, async function (err) {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    err.message = 'File size is too large. Maximum filesize is 5MB.';
                }
                return res.status(400).json({ success: false, message: err.message });
            } else if (err) {
                return res.status(500).json({ success: false, message: err.message || 'Upload failed' });
            }

            if (!req.file) {
                return res.status(400).json({ success: false, message: 'No image file provided' });
            }

            res.json({
                success: true,
                message: 'Image uploaded successfully',
                data: { url: req.file.path }
            });
        });
    } catch (error) {
        console.error('Image upload error:', error);
        if (error.http_code === 502 || error.name === 'TimeoutError' || error.http_code === 499) {
            return res.status(502).json({
                success: false,
                message: 'Image upload service is temporarily unavailable. Please try again.'
            });
        }
        res.status(500).json({ success: false, message: error.message });
    }
}));


// create new product
router.post('/', asyncHandler(async (req, res) => {
    try {
        // Execute the Multer middleware to handle multiple file fields
        uploadProduct.fields([
            { name: 'image1', maxCount: 1 },
            { name: 'image2', maxCount: 1 },
            { name: 'image3', maxCount: 1 },
            { name: 'image4', maxCount: 1 },
            { name: 'image5', maxCount: 1 }
        ])(req, res, async function (err) {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    err.message = 'File size is too large. Maximum filesize is 5MB per image.';
                }
                console.log(`Add product: ${err}`);
                return res.json({ success: false, message: err.message });
            } else if (err) {
                console.log(`Add product: ${err}`);
                return res.json({ success: false, message: err.message || 'An error occurred during upload' });
            }

            const { name, description, quantity, price, offerPrice, supplierPrice, supplierOfferPrice, proCategoryId, proSubCategoryId, proSubSubCategoryId, proBrandId, proVariantTypeId, proVariantId,
                proVariants, skus, imageUrls: preUploadedImageUrls,
                weight, dimensions, stockStatus, lowStockThreshold, tags, specifications, warranty,
                featured, emiEligible, isActive, metaTitle, metaDescription,
                gender, material, fit, pattern, sleeveLength, neckline, occasion, careInstructions
            } = req.body;

            if (!name || !quantity || !price || !proCategoryId || !proSubCategoryId) {
                return res.status(400).json({ success: false, message: "Required fields are missing." });
            }

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
            const cleanId = (id) => (!id || id === 'null' || id === '') ? undefined : id;

            let parsedProVariants = parseProVariants(proVariants);
            let parsedSkus = parseSkus(skus);

            // Build images array: prefer pre-uploaded URLs, fallback to multer files
            const imageList = [];

            // Check for pre-uploaded image URLs (from the new upload-image endpoint)
            let parsedPreUploadedUrls = preUploadedImageUrls;
            console.log('[CreateProduct] Raw imageUrls:', preUploadedImageUrls);
            console.log('[CreateProduct] Type:', typeof preUploadedImageUrls);
            if (typeof preUploadedImageUrls === 'string') {
                try { parsedPreUploadedUrls = JSON.parse(preUploadedImageUrls); } catch (e) {
                    console.log('[CreateProduct] JSON parse failed:', e.message);
                    parsedPreUploadedUrls = [];
                }
            }
            console.log('[CreateProduct] Parsed URLs:', parsedPreUploadedUrls);

            if (Array.isArray(parsedPreUploadedUrls) && parsedPreUploadedUrls.length > 0) {
                // Use pre-uploaded URLs
                parsedPreUploadedUrls.forEach((item, index) => {
                    if (typeof item === 'string' && item) {
                        imageList.push({ image: index + 1, url: item });
                    } else if (item && item.url) {
                        imageList.push({ image: item.image || index + 1, url: item.url });
                    }
                });
            } else {
                // Fallback: use multer-uploaded files (legacy flow)
                const fields = ['image1', 'image2', 'image3', 'image4', 'image5'];
                fields.forEach((field, index) => {
                    if (req.files && req.files[field] && req.files[field].length > 0) {
                        imageList.push({ image: index + 1, url: req.files[field][0].path });
                    }
                });
            }
            console.log('[CreateProduct] Final imageList:', imageList);

            const newProduct = new Product({
                name, description, quantity, price, offerPrice,
                supplierPrice, supplierOfferPrice,
                proCategoryId: cleanId(proCategoryId), 
                proSubCategoryId: cleanId(proSubCategoryId), 
                proSubSubCategoryId: cleanId(proSubSubCategoryId), 
                proBrandId: cleanId(proBrandId), 
                proVariantTypeId: cleanId(proVariantTypeId), 
                proVariantId: proVariantId ? (Array.isArray(proVariantId) ? proVariantId.map(cleanId).filter(Boolean) : [cleanId(proVariantId)].filter(Boolean)) : [],
                proVariants: parsedProVariants || [],
                skus: parsedSkus || [],
                weight: weight || 0,
                dimensions: parsedDimensions || {},
                stockStatus: stockStatus || 'in_stock',
                lowStockThreshold: lowStockThreshold || 10,
                tags: parsedTags || [],
                specifications: parsedSpecs || [],
                warranty: warranty || undefined,
                featured: featured === 'true' || featured === true,
                emiEligible: emiEligible !== 'false' && emiEligible !== false,
                isActive: isActive !== 'false' && isActive !== false,
                metaTitle: metaTitle || undefined,
                metaDescription: metaDescription || undefined,
                gender: gender || undefined,
                material: material || undefined,
                fit: fit || undefined,
                pattern: pattern || undefined,
                sleeveLength: sleeveLength || undefined,
                neckline: neckline || undefined,
                occasion: occasion || undefined,
                careInstructions: careInstructions || undefined,
                images: imageList
            });

            try {
                await newProduct.save();
            } catch (saveError) {
                if (saveError.code === 11000) {
                    const field = Object.keys(saveError.keyPattern || {})[0] || 'unknown';
                    console.error(`Duplicate key error on field '${field}':`, saveError.keyValue);
                    return res.status(409).json({
                        success: false,
                        message: `A product with this ${field} already exists. Please use a different value.`
                    });
                }
                throw saveError;
            }

            res.json({ success: true, message: "Product created successfully.", data: null });
        });
    } catch (error) {
        console.error("Error creating product:", error);
        if (error.http_code === 502 || error.message?.includes('502')) {
            return res.status(502).json({
                success: false,
                message: 'Image upload service is temporarily unavailable. Please try again in a moment.'
            });
        }
        res.status(500).json({ success: false, message: error.message });
    }
}));



// Delete a product via POST (Flutter Web compatibility - DELETE method may not work through proxy)
router.post('/:id/delete', asyncHandler(async (req, res) => {
    const productID = req.params.id;
    try {
        const product = await Product.findByIdAndDelete(productID);
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found." });
        }
        res.json({ success: true, message: "Product deleted successfully." });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

// Update a product (Supports both PUT and POST for Flutter Web compatibility with FormData)
router.use('/:id', asyncHandler(async (req, res, next) => {
    if (req.method === 'PUT' || (req.method === 'POST' && req.path.includes('/update'))) {
        return next();
    }
    if (req.method === 'POST') {
        // Allow POST to /:id to act as an update as well
        return next();
    }
    next('route');
}), asyncHandler(async (req, res) => {
    const productId = req.params.id;
    try {
        // Execute the Multer middleware to handle file fields
        uploadProduct.fields([
            { name: 'image1', maxCount: 1 },
            { name: 'image2', maxCount: 1 },
            { name: 'image3', maxCount: 1 },
            { name: 'image4', maxCount: 1 },
            { name: 'image5', maxCount: 1 }
        ])(req, res, async function (err) {
            if (err) {
                console.log(`Update product: ${err}`);
                return res.status(500).json({ success: false, message: err.message });
            }

            const { name, description, quantity, price, offerPrice, supplierPrice, supplierOfferPrice, proCategoryId, proSubCategoryId, proSubSubCategoryId, proBrandId, proVariantTypeId, proVariantId,
                proVariants, skus, imageUrls: preUploadedImageUrls,
                weight, dimensions, stockStatus, lowStockThreshold, tags, specifications, warranty,
                featured, emiEligible, isActive, metaTitle, metaDescription,
                gender, material, fit, pattern, sleeveLength, neckline, occasion, careInstructions
            } = req.body;

            const productToUpdate = await Product.findById(productId);
            if (!productToUpdate) {
                return res.status(404).json({ success: false, message: "Product not found." });
            }

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
            let parsedProVariants = parseProVariants(proVariants);
            let parsedSkus = parseSkus(skus);

            const cleanId = (id) => (!id || id === 'null' || id === '') ? undefined : id;

            productToUpdate.name = name || productToUpdate.name;
            productToUpdate.description = description || productToUpdate.description;
            productToUpdate.quantity = quantity || productToUpdate.quantity;
            productToUpdate.price = price || productToUpdate.price;
            productToUpdate.offerPrice = offerPrice || productToUpdate.offerPrice;
            if (supplierPrice !== undefined) productToUpdate.supplierPrice = supplierPrice;
            if (supplierOfferPrice !== undefined) productToUpdate.supplierOfferPrice = supplierOfferPrice;
            productToUpdate.proCategoryId = cleanId(proCategoryId) || productToUpdate.proCategoryId;
            productToUpdate.proSubCategoryId = cleanId(proSubCategoryId) || productToUpdate.proSubCategoryId;
            if (proSubSubCategoryId !== undefined) productToUpdate.proSubSubCategoryId = cleanId(proSubSubCategoryId);
            if (proBrandId !== undefined) productToUpdate.proBrandId = cleanId(proBrandId);
            if (proVariantTypeId !== undefined) productToUpdate.proVariantTypeId = cleanId(proVariantTypeId);
            if (proVariantId !== undefined) productToUpdate.proVariantId = Array.isArray(proVariantId) ? proVariantId.map(cleanId).filter(Boolean) : [cleanId(proVariantId)].filter(Boolean);
            if (parsedProVariants) productToUpdate.proVariants = parsedProVariants;
            if (parsedSkus) productToUpdate.skus = parsedSkus;

            if (weight !== undefined) productToUpdate.weight = weight || 0;
            if (parsedDimensions) productToUpdate.dimensions = parsedDimensions;
            if (stockStatus) productToUpdate.stockStatus = stockStatus;
            if (lowStockThreshold !== undefined) productToUpdate.lowStockThreshold = lowStockThreshold || 10;
            if (parsedTags) productToUpdate.tags = parsedTags;
            if (parsedSpecs) productToUpdate.specifications = parsedSpecs;
            if (warranty !== undefined) productToUpdate.warranty = warranty;
            if (featured !== undefined) productToUpdate.featured = featured === 'true' || featured === true;
            if (emiEligible !== undefined) productToUpdate.emiEligible = emiEligible !== 'false' && emiEligible !== false;
            if (isActive !== undefined) productToUpdate.isActive = isActive !== 'false' && isActive !== false;
            if (metaTitle !== undefined) productToUpdate.metaTitle = metaTitle;
            if (metaDescription !== undefined) productToUpdate.metaDescription = metaDescription;

            if (gender !== undefined) productToUpdate.gender = gender || undefined;
            if (material !== undefined) productToUpdate.material = material || undefined;
            if (fit !== undefined) productToUpdate.fit = fit || undefined;
            if (pattern !== undefined) productToUpdate.pattern = pattern || undefined;
            if (sleeveLength !== undefined) productToUpdate.sleeveLength = sleeveLength || undefined;
            if (neckline !== undefined) productToUpdate.neckline = neckline || undefined;
            if (occasion !== undefined) productToUpdate.occasion = occasion || undefined;
            if (careInstructions !== undefined) productToUpdate.careInstructions = careInstructions || undefined;

            // Handle images: prefer pre-uploaded URLs, fallback to multer files
            let parsedPreUploadedUrls = preUploadedImageUrls;
            if (typeof preUploadedImageUrls === 'string') {
                try { parsedPreUploadedUrls = JSON.parse(preUploadedImageUrls); } catch (e) { parsedPreUploadedUrls = []; }
            }

            if (Array.isArray(parsedPreUploadedUrls) && parsedPreUploadedUrls.length > 0) {
                // Replace images with pre-uploaded URLs
                parsedPreUploadedUrls.forEach((item, index) => {
                    const url = typeof item === 'string' ? item : item?.url;
                    const imgNum = (typeof item === 'object' && item?.image) ? item.image : index + 1;
                    if (url) {
                        let imageEntry = productToUpdate.images.find(img => img.image === imgNum);
                        if (imageEntry) {
                            imageEntry.url = url;
                        } else {
                            productToUpdate.images.push({ image: imgNum, url: url });
                        }
                    }
                });
            } else {
                // Fallback: use multer-uploaded files (legacy flow)
                const fields = ['image1', 'image2', 'image3', 'image4', 'image5'];
                fields.forEach((field, index) => {
                    if (req.files && req.files[field] && req.files[field].length > 0) {
                        const file = req.files[field][0];
                        let imageEntry = productToUpdate.images.find(img => img.image === (index + 1));
                        if (imageEntry) {
                            imageEntry.url = file.path;
                        } else {
                            productToUpdate.images.push({ image: index + 1, url: file.path });
                        }
                    }
                });
            }

            await productToUpdate.save();
            res.json({ success: true, message: "Product updated successfully." });
        });
    } catch (error) {
        console.error("Error updating product:", error);
        res.status(500).json({ success: false, message: error.message });
    }
}));

// Delete a product
router.delete('/:id', asyncHandler(async (req, res) => {
    const productID = req.params.id;
    try {
        const product = await Product.findByIdAndDelete(productID);
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found." });
        }
        res.json({ success: true, message: "Product deleted successfully." });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

module.exports = router;
