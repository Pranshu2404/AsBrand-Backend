const express = require('express');
const router = express.Router();
const SubSubCategory = require('../model/subSubCategory');
const { uploadCategory } = require('../uploadFile');
const multer = require('multer');
const asyncHandler = require('express-async-handler');
// Create a new SubSubCategory (Admin only)
router.post('/', asyncHandler(async (req, res) => {
    try {
        uploadCategory.single('img')(req, res, async function (err) {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    err.message = 'File size is too large. Maximum filesize is 5MB.';
                }
                console.log(`Add subSubCategory: ${err}`);
                return res.json({ success: false, message: err.message });
            } else if (err) {
                console.log(`Add subSubCategory: ${err}`);
                return res.json({ success: false, message: err.message || 'An error occurred during upload' });
            }

            const { name, subCategoryId, categoryId } = req.body;
            let imageUrl = 'no_url';
            if (req.file) {
                imageUrl = req.file.path;
            }
            
            if (!name || !subCategoryId || !categoryId) {
                return res.status(400).json({ success: false, message: "Name, subCategoryId, and categoryId are required." });
            }

            try {
                const subSubCategory = new SubSubCategory({ name, subCategoryId, categoryId, image: imageUrl });
                await subSubCategory.save();
                
                res.status(201).json({ success: true, message: "SubSubCategory created successfully.", data: subSubCategory });
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });
    } catch (err) {
        console.log(`Error creating subSubCategory: ${err.message}`);
        return res.status(500).json({ success: false, message: err.message });
    }
}));

// Get all SubSubCategories (Public)
router.get('/', async (req, res) => {
    try {
        let query = {};
        if (req.query.subCategoryId) {
            query.subCategoryId = req.query.subCategoryId;
        }
        if (req.query.categoryId) {
            query.categoryId = req.query.categoryId;
        }
        
        const subSubCategories = await SubSubCategory.find(query)
            .populate('categoryId', 'id name')
            .populate('subCategoryId', 'id name');
            
        res.json({ success: true, message: "SubSubCategories retrieved successfully.", data: subSubCategories });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get a single SubSubCategory by ID
router.get('/:id', async (req, res) => {
    try {
        const subSubCategory = await SubSubCategory.findById(req.params.id)
            .populate('categoryId', 'id name')
            .populate('subCategoryId', 'id name');
            
        if (!subSubCategory) {
            return res.status(404).json({ success: false, message: "SubSubCategory not found." });
        }
        res.json({ success: true, message: "SubSubCategory retrieved successfully.", data: subSubCategory });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update a SubSubCategory (Admin only)
router.put('/:id', asyncHandler(async (req, res) => {
    try {
        const subSubCategoryID = req.params.id;
        uploadCategory.single('img')(req, res, async function (err) {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    err.message = 'File size is too large. Maximum filesize is 5MB.';
                }
                console.log(`Update subSubCategory: ${err.message}`);
                return res.json({ success: false, message: err.message });
            } else if (err) {
                console.log(`Update subSubCategory: ${err.message}`);
                return res.json({ success: false, message: err.message });
            }

            const { name, subCategoryId, categoryId } = req.body;
            let image = req.body.image;

            if (req.file) {
                image = req.file.path;
            }

            try {
                const subSubCategory = await SubSubCategory.findByIdAndUpdate(
                    subSubCategoryID,
                    { name, subCategoryId, categoryId, image },
                    { new: true, runValidators: true }
                );
                if (!subSubCategory) {
                    return res.status(404).json({ success: false, message: "SubSubCategory not found." });
                }
                res.json({ success: true, message: "SubSubCategory updated successfully.", data: subSubCategory });
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });
    } catch (err) {
        console.log(`Error updating subSubCategory: ${err.message}`);
        return res.status(500).json({ success: false, message: err.message });
    }
}));

// Delete a SubSubCategory (Admin only)
router.delete('/:id', async (req, res) => {
    try {
        const subSubCategory = await SubSubCategory.findByIdAndDelete(req.params.id);
        if (!subSubCategory) {
            return res.status(404).json({ success: false, message: "SubSubCategory not found." });
        }
        res.json({ success: true, message: "SubSubCategory deleted successfully." });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
