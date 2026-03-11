const express = require('express');
const router = express.Router();
const Brand = require('../model/brand');
const Product = require('../model/product');
const asyncHandler = require('express-async-handler');
const { uploadCategory } = require('../uploadFile');
const multer = require('multer');
// Get all brands
router.get('/', asyncHandler(async (req, res) => {
    try {
        const brands = await Brand.find()
            .populate({ path: 'subcategoryId', populate: { path: 'categoryId' } })
            .sort({ 'subcategoryId': 1 });
        res.json({ success: true, message: "Brands retrieved successfully.", data: brands });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

// Get a brand by ID
router.get('/:id', asyncHandler(async (req, res) => {
    try {
        const brandID = req.params.id;
        const brand = await Brand.findById(brandID).populate('subcategoryId');
        if (!brand) {
            return res.status(404).json({ success: false, message: "Brand not found." });
        }
        res.json({ success: true, message: "Brand retrieved successfully.", data: brand });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

// Create a new brand
router.post('/', asyncHandler(async (req, res) => {
    try {
        uploadCategory.single('img')(req, res, async function (err) {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    err.message = 'File size is too large. Maximum filesize is 5MB.';
                }
                console.log(`Add brand: ${err}`);
                return res.json({ success: false, message: err.message });
            } else if (err) {
                console.log(`Add brand: ${err}`);
                return res.json({ success: false, message: err.message || 'An error occurred during upload' });
            }
            
            const { name, subcategoryId } = req.body;
            let imageUrl = 'no_url';
            if (req.file) {
                imageUrl = req.file.path;
            }

            if (!name || !subcategoryId) {
                return res.status(400).json({ success: false, message: "Name and subcategory ID are required." });
            }

            try {
                const brand = new Brand({ name, subcategoryId, image: imageUrl });
                const newBrand = await brand.save();
                res.json({ success: true, message: "Brand created successfully.", data: newBrand });
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });
    } catch (err) {
        console.log(`Error creating brand: ${err.message}`);
        return res.status(500).json({ success: false, message: err.message });
    }
}));

// Update a brand
router.put('/:id', asyncHandler(async (req, res) => {
    try {
        const brandID = req.params.id;
        uploadCategory.single('img')(req, res, async function (err) {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    err.message = 'File size is too large. Maximum filesize is 5MB.';
                }
                console.log(`Update brand: ${err.message}`);
                return res.json({ success: false, message: err.message });
            } else if (err) {
                console.log(`Update brand: ${err.message}`);
                return res.json({ success: false, message: err.message });
            }

            const { name, subcategoryId } = req.body;
            let image = req.body.image;

            if (req.file) {
                image = req.file.path;
            }

            if (!name || !subcategoryId) {
                return res.status(400).json({ success: false, message: "Name and subcategory ID are required." });
            }

            try {
                const updatedBrand = await Brand.findByIdAndUpdate(brandID, { name, subcategoryId, image }, { new: true });
                if (!updatedBrand) {
                    return res.status(404).json({ success: false, message: "Brand not found." });
                }
                res.json({ success: true, message: "Brand updated successfully.", data: null });
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });
    } catch (err) {
        console.log(`Error updating brand: ${err.message}`);
        return res.status(500).json({ success: false, message: err.message });
    }
}));

// Delete a brand
router.delete('/:id', asyncHandler(async (req, res) => {
    const brandID = req.params.id;
    try {
        // Check if any products reference this brand
        const products = await Product.find({ proBrandId: brandID });
        if (products.length > 0) {
            return res.status(400).json({ success: false, message: "Cannot delete brand. Products are referencing it." });
        }

        // If no products are referencing the brand, proceed with deletion
        const brand = await Brand.findByIdAndDelete(brandID);
        if (!brand) {
            return res.status(404).json({ success: false, message: "Brand not found." });
        }
        res.json({ success: true, message: "Brand deleted successfully." });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));


module.exports = router;
