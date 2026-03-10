const mongoose = require('mongoose');

const subSubCategorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true
    },
    subCategoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SubCategory',
        required: [true, 'SubCategory ID is required']
    },
    categoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        required: [true, 'Category ID is required']
    },
    image: {
        type: String,
        default: 'no_url'
    }
}, { timestamps: true });

const SubSubCategory = mongoose.model('SubSubCategory', subSubCategorySchema);

module.exports = SubSubCategory;
