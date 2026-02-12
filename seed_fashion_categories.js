/**
 * Fashion Categories Seed Script
 * Run this to populate the database with clothing-focused categories and subcategories
 * Usage: node seed_fashion_categories.js
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Category = require('./model/category');
const SubCategory = require('./model/subCategory');
const Brand = require('./model/brand');

dotenv.config();

// Fashion category images from Unsplash
const categoryImages = {
    "Men's Wear": 'https://images.unsplash.com/photo-1617137968427-85924c800a22?w=400&h=400&fit=crop',
    "Women's Wear": 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=400&h=400&fit=crop',
    "Kids Wear": 'https://images.unsplash.com/photo-1622290291468-a28f7a7dc6a8?w=400&h=400&fit=crop',
    "Ethnic Wear": 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=400&h=400&fit=crop',
    "Winter Wear": 'https://images.unsplash.com/photo-1544923246-77307dd628b8?w=400&h=400&fit=crop',
    "Sportswear": 'https://images.unsplash.com/photo-1556906781-9a412961c28c?w=400&h=400&fit=crop',
    "Footwear": 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=400&fit=crop',
    "Accessories": 'https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=400&h=400&fit=crop',
};

// Fashion categories with their subcategories
const fashionData = [
    {
        name: "Men's Wear",
        subcategories: [
            'T-Shirts', 'Shirts', 'Jeans', 'Trousers', 'Shorts',
            'Suits & Blazers', 'Innerwear', 'Sleepwear'
        ]
    },
    {
        name: "Women's Wear",
        subcategories: [
            'Tops', 'Dresses', 'Jeans', 'Trousers', 'Skirts',
            'Jumpsuits', 'Lingerie', 'Sleepwear'
        ]
    },
    {
        name: "Kids Wear",
        subcategories: [
            'Boys T-Shirts', 'Boys Shirts', 'Boys Jeans',
            'Girls Dresses', 'Girls Tops', 'Girls Jeans',
            'Infant Wear'
        ]
    },
    {
        name: "Ethnic Wear",
        subcategories: [
            'Kurtas', 'Kurta Sets', 'Sherwanis', 'Nehru Jackets',
            'Sarees', 'Lehengas', 'Salwar Suits', 'Dupattas'
        ]
    },
    {
        name: "Winter Wear",
        subcategories: [
            'Jackets', 'Sweaters', 'Hoodies', 'Sweatshirts',
            'Coats', 'Cardigans', 'Thermals', 'Scarves & Mufflers'
        ]
    },
    {
        name: "Sportswear",
        subcategories: [
            'Sports T-Shirts', 'Track Pants', 'Sports Shorts',
            'Tracksuits', 'Gym Wear', 'Swimwear', 'Sports Bras'
        ]
    },
    {
        name: "Footwear",
        subcategories: [
            'Sneakers', 'Casual Shoes', 'Formal Shoes', 'Sports Shoes',
            'Sandals', 'Flip Flops', 'Heels', 'Boots'
        ]
    },
    {
        name: "Accessories",
        subcategories: [
            'Watches', 'Sunglasses', 'Bags', 'Wallets',
            'Belts', 'Jewelry', 'Caps & Hats', 'Ties'
        ]
    }
];

// Fashion brands organized by subcategory
const fashionBrands = {
    "T-Shirts": ['Zara', 'H&M', 'Levis', 'Nike', 'Adidas', 'Puma', 'Allen Solly'],
    "Shirts": ['Arrow', 'Van Heusen', 'Peter England', 'Louis Philippe', 'Allen Solly'],
    "Jeans": ['Levis', 'Wrangler', 'Lee', 'Pepe Jeans', 'Spykar', 'Flying Machine'],
    "Dresses": ['Zara', 'H&M', 'Forever 21', 'Mango', 'Vero Moda', 'Only'],
    "Sneakers": ['Nike', 'Adidas', 'Puma', 'Reebok', 'New Balance', 'Skechers'],
    "Watches": ['Titan', 'Fastrack', 'Fossil', 'Casio', 'Timex'],
    // Default brands for other subcategories
    "default": ['Zara', 'H&M', 'Levis', 'Nike', 'Adidas', 'Puma', 'Allen Solly']
};

const seedFashionCategories = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URL);
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

        // Option to clear existing data (uncomment if needed)
        // await Category.deleteMany({});
        // await SubCategory.deleteMany({});
        // await Brand.deleteMany({});
        // console.log('🗑️  Cleared existing categories, subcategories, and brands');

        let totalCategories = 0;
        let totalSubcategories = 0;
        let totalBrands = 0;

        for (const catData of fashionData) {
            // Create or find category
            let category = await Category.findOne({ name: catData.name });
            if (!category) {
                category = await Category.create({
                    name: catData.name,
                    image: categoryImages[catData.name] || categoryImages["Men's Wear"]
                });
                console.log(`📁 Created category: ${catData.name}`);
                totalCategories++;
            } else {
                console.log(`📁 Category exists: ${catData.name}`);
            }

            // Create subcategories
            for (const subName of catData.subcategories) {
                let subcategory = await SubCategory.findOne({
                    name: subName,
                    categoryId: category._id
                });

                if (!subcategory) {
                    subcategory = await SubCategory.create({
                        name: subName,
                        categoryId: category._id
                    });
                    console.log(`  📂 Created subcategory: ${subName}`);
                    totalSubcategories++;
                }

                // Create brands for this subcategory
                const brandsForSub = fashionBrands[subName] || fashionBrands["default"];
                for (const brandName of brandsForSub) {
                    let brand = await Brand.findOne({
                        name: brandName,
                        subcategoryId: subcategory._id
                    });

                    if (!brand) {
                        brand = await Brand.create({
                            name: brandName,
                            subcategoryId: subcategory._id
                        });
                        console.log(`    🏷️  Created brand: ${brandName}`);
                        totalBrands++;
                    }
                }
            }
        }

        console.log('\n========================================');
        console.log('✅ Fashion Categories Seeding Complete!');
        console.log(`   📁 Categories: ${totalCategories} new`);
        console.log(`   📂 Subcategories: ${totalSubcategories} new`);
        console.log(`   🏷️  Brands: ${totalBrands} new`);
        console.log('========================================\n');

    } catch (error) {
        console.error('❌ Error seeding fashion data:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
};

seedFashionCategories();
