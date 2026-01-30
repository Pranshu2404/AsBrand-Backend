const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const dotenv = require('dotenv');

dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Category Storage
const storageCategory = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'asbrand/categories',
    allowed_formats: ['jpg', 'png', 'jpeg'],
  },
});

const uploadCategory = multer({ storage: storageCategory });

// Product Storage
const storageProduct = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'asbrand/products',
    allowed_formats: ['jpg', 'png', 'jpeg'],
  },
});

const uploadProduct = multer({ storage: storageProduct });

// Poster Storage
const storagePoster = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'asbrand/posters',
    allowed_formats: ['jpg', 'png', 'jpeg'],
  },
});

const uploadPosters = multer({ storage: storagePoster });

module.exports = {
  uploadCategory,
  uploadProduct,
  uploadPosters,
};
