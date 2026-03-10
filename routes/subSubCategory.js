const express = require('express');
const router = express.Router();
const SubSubCategory = require('../model/subSubCategory');

// Create a new SubSubCategory (Admin only)
router.post('/', async (req, res) => {
    try {
        const { name, subCategoryId, categoryId, image } = req.body;
        
        if (!name || !subCategoryId || !categoryId) {
            return res.status(400).json({ success: false, message: "Name, subCategoryId, and categoryId are required." });
        }

        const subSubCategory = new SubSubCategory({ name, subCategoryId, categoryId, image });
        await subSubCategory.save();
        
        res.status(201).json({ success: true, message: "SubSubCategory created successfully.", data: subSubCategory });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

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
router.put('/:id', async (req, res) => {
    try {
        const subSubCategory = await SubSubCategory.findByIdAndUpdate(
            req.params.id,
            req.body,
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
