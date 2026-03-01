const express = require('express');
const router = express.Router();
const Product = require('../model/product');
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

// Get all products
router.get('/', asyncHandler(async (req, res) => {
    try {
        const { minPrice, maxPrice, sort, category, keyword, gender, brand, minDiscount } = req.query;
        let query = {};

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

        // Search by keyword
        if (keyword) {
            query.name = { $regex: keyword, $options: 'i' };
        }

        let productsQuery = Product.find(query)
            .populate('proCategoryId', 'id name')
            .populate('proSubCategoryId', 'id name')
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

        const products = await productsQuery;
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
            .populate('proVariants.variantTypeId', 'id name type');
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found." });
        }
        res.json({ success: true, message: "Product retrieved successfully.", data: product });
    } catch (error) {
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
                // Handle Multer errors, if any
                if (err.code === 'LIMIT_FILE_SIZE') {
                    err.message = 'File size is too large. Maximum filesize is 5MB per image.';
                }
                console.log(`Add product: ${err}`);
                return res.json({ success: false, message: err.message });
            } else if (err) {
                // Handle other errors, if any
                console.log(`Add product: ${err}`);
                return res.json({ success: false, message: err.message || 'An error occurred during upload' });
            }

            // Extract product data from the request body
            const { name, description, quantity, price, offerPrice, proCategoryId, proSubCategoryId, proBrandId, proVariantTypeId, proVariantId,
                proVariants,
                // Enhanced fields
                weight, dimensions, stockStatus, lowStockThreshold, tags, specifications, warranty,
                featured, emiEligible, isActive, metaTitle, metaDescription,
                // Clothing-specific fields
                gender, material, fit, pattern, sleeveLength, neckline, occasion, careInstructions
            } = req.body;

            // Check if any required fields are missing
            if (!name || !quantity || !price || !proCategoryId || !proSubCategoryId) {
                return res.status(400).json({ success: false, message: "Required fields are missing." });
            }

            // Parse fields that may come as JSON strings from FormData
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

            // Initialize an array to store image URLs
            const imageUrls = [];

            // Iterate over the file fields
            const fields = ['image1', 'image2', 'image3', 'image4', 'image5'];
            fields.forEach((field, index) => {
                if (req.files[field] && req.files[field].length > 0) {
                    const file = req.files[field][0];
                    const imageUrl = file.path;
                    imageUrls.push({ image: index + 1, url: imageUrl });
                }
            });

            // Create a new product object with all data
            const newProduct = new Product({
                name, description, quantity, price, offerPrice,
                proCategoryId, proSubCategoryId, proBrandId, proVariantTypeId, proVariantId,
                proVariants: parsedProVariants || [],
                // Enhanced fields
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
                // Clothing-specific fields
                gender: gender || undefined,
                material: material || undefined,
                fit: fit || undefined,
                pattern: pattern || undefined,
                sleeveLength: sleeveLength || undefined,
                neckline: neckline || undefined,
                occasion: occasion || undefined,
                careInstructions: careInstructions || undefined,
                images: imageUrls
            });

            // Save the new product to the database
            try {
                await newProduct.save();
            } catch (saveError) {
                // Handle MongoDB duplicate key error
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

            // Send a success response back to the client
            res.json({ success: true, message: "Product created successfully.", data: null });
        });
    } catch (error) {
        // Handle any errors that occur during the process
        console.error("Error creating product:", error);
        // Handle Cloudinary 502 errors
        if (error.http_code === 502 || error.message?.includes('502')) {
            return res.status(502).json({
                success: false,
                message: 'Image upload service is temporarily unavailable. Please try again in a moment.'
            });
        }
        res.status(500).json({ success: false, message: error.message });
    }
}));



// Update a product
router.put('/:id', asyncHandler(async (req, res) => {
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

            const { name, description, quantity, price, offerPrice, proCategoryId, proSubCategoryId, proBrandId, proVariantTypeId, proVariantId,
                proVariants,
                // Enhanced fields
                weight, dimensions, stockStatus, lowStockThreshold, tags, specifications, warranty,
                featured, emiEligible, isActive, metaTitle, metaDescription,
                // Clothing-specific fields
                gender, material, fit, pattern, sleeveLength, neckline, occasion, careInstructions
            } = req.body;

            // Find the product by ID
            const productToUpdate = await Product.findById(productId);
            if (!productToUpdate) {
                return res.status(404).json({ success: false, message: "Product not found." });
            }

            // Parse fields that may come as JSON strings from FormData
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

            // Update basic product properties if provided
            productToUpdate.name = name || productToUpdate.name;
            productToUpdate.description = description || productToUpdate.description;
            productToUpdate.quantity = quantity || productToUpdate.quantity;
            productToUpdate.price = price || productToUpdate.price;
            productToUpdate.offerPrice = offerPrice || productToUpdate.offerPrice;
            productToUpdate.proCategoryId = proCategoryId || productToUpdate.proCategoryId;
            productToUpdate.proSubCategoryId = proSubCategoryId || productToUpdate.proSubCategoryId;
            productToUpdate.proBrandId = proBrandId || productToUpdate.proBrandId;
            productToUpdate.proVariantTypeId = proVariantTypeId || productToUpdate.proVariantTypeId;
            productToUpdate.proVariantId = proVariantId || productToUpdate.proVariantId;
            if (parsedProVariants) productToUpdate.proVariants = parsedProVariants;

            // Update enhanced fields
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

            // Update clothing-specific fields
            if (gender !== undefined) productToUpdate.gender = gender || undefined;
            if (material !== undefined) productToUpdate.material = material || undefined;
            if (fit !== undefined) productToUpdate.fit = fit || undefined;
            if (pattern !== undefined) productToUpdate.pattern = pattern || undefined;
            if (sleeveLength !== undefined) productToUpdate.sleeveLength = sleeveLength || undefined;
            if (neckline !== undefined) productToUpdate.neckline = neckline || undefined;
            if (occasion !== undefined) productToUpdate.occasion = occasion || undefined;
            if (careInstructions !== undefined) productToUpdate.careInstructions = careInstructions || undefined;

            // Iterate over the file fields to update images
            const fields = ['image1', 'image2', 'image3', 'image4', 'image5'];
            fields.forEach((field, index) => {
                if (req.files[field] && req.files[field].length > 0) {
                    const file = req.files[field][0];
                    const imageUrl = file.path;
                    // Update the specific image URL in the images array
                    let imageEntry = productToUpdate.images.find(img => img.image === (index + 1));
                    if (imageEntry) {
                        imageEntry.url = imageUrl;
                    } else {
                        // If the image entry does not exist, add it
                        productToUpdate.images.push({ image: index + 1, url: imageUrl });
                    }
                }
            });

            // Save the updated product
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
