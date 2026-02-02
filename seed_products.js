const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Product = require('./model/product');
const Category = require('./model/category');
const SubCategory = require('./model/subCategory');
const Brand = require('./model/brand');

dotenv.config();

const sampleImages = [
    'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80',
    'https://images.unsplash.com/photo-1542272454315-4c01d7abdf4a?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80',
    'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80',
    'https://images.unsplash.com/photo-1542291026-7eec264c27ff?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80',
    'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80',
    'https://images.unsplash.com/photo-1483985988355-763728e1935b?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80',
    'https://images.unsplash.com/photo-1485955900006-10f4d324d411?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80'
];

const clothingNames = [
    'Cotton T-Shirt', 'Denim Jacket', 'Formal Shirt', 'Casual Chinos',
    'Summer Dress', 'Hoodie', 'Slim Fit Jeans', 'Polo Shirt',
    'Leather Jacket', 'Sweatshirt', 'Cargo Pants', 'Blazer'
];

const brandNames = ['Nike', 'Adidas', 'Puma', 'Zara', 'H&M', 'Levis', 'Allen Solly'];
// ... (keep your imports and arrays as they are)

const seedProducts = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URL);
        console.log(`MongoDB Connected: ${conn.connection.host}`);

        // 1. Create Category
        let category = await Category.findOne({ name: 'Fashion' });
        if (!category) {
            category = await Category.create({ name: 'Fashion', image: sampleImages[0] });
            console.log('Created Fashion Category');
        }

        // 2. Create SubCategories
        const subCats = ['Men Clothing', 'Women Clothing'];
        const subCategoryDocs = [];
        for (const scName of subCats) {
            let sc = await SubCategory.findOne({ name: scName, categoryId: category._id });
            if (!sc) sc = await SubCategory.create({ name: scName, categoryId: category._id });
            subCategoryDocs.push(sc);
        }

        // 3. Create Brands
        const brandDocs = [];
        for (const bName of brandNames) {
            const sc = subCategoryDocs[Math.floor(Math.random() * subCategoryDocs.length)];
            let brand = await Brand.findOne({ name: bName, subcategoryId: sc._id });
            if (!brand) brand = await Brand.create({ name: bName, subcategoryId: sc._id });
            brandDocs.push(brand);
        }

        // 4. Create Products
        const products = [];
        for (let i = 0; i < 50; i++) {
            const name = clothingNames[Math.floor(Math.random() * clothingNames.length)] + ' ' + (i + 1);
            const price = Math.floor(Math.random() * (5000 - 500 + 1)) + 500;
            const imageUrl = sampleImages[Math.floor(Math.random() * sampleImages.length)];
            const subCat = subCategoryDocs[Math.floor(Math.random() * subCategoryDocs.length)];

            // Match brand to subcategory
            const validBrands = brandDocs.filter(b => b.subcategoryId.toString() === subCat._id.toString());
            const brand = validBrands.length > 0 ? validBrands[Math.floor(Math.random() * validBrands.length)] : brandDocs[0];

            // Logic for fields
            let gender = 'Unisex';
            if (subCat.name.includes('Men')) gender = 'Men';
            else if (subCat.name.includes('Women')) gender = 'Women';

            const discount = Math.floor(Math.random() * 60);
            const offerPrice = Math.floor(price * (1 - discount / 100));

            // Fixed the push syntax here
            products.push({
                name: name,
                description: `High quality ${name}. Comfortable and stylish.`,
                price: price,
                offerPrice: offerPrice,
                gender: gender,
                quantity: 100,
                proCategoryId: category._id,
                proSubCategoryId: subCat._id,
                proBrandId: brand._id,
                images: [
                    { image: 1, url: imageUrl },
                    { image: 2, url: imageUrl }
                ],
                isActive: true,
                stockStatus: 'in_stock'
            });
        }

        await Product.insertMany(products);
        console.log(`✅ Successfully inserted ${products.length} products.`);

    } catch (error) {
        console.error('❌ Error seeding data:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected');
    }
};

seedProducts();
