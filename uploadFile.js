const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const dotenv = require('dotenv');

dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  timeout: 120000 // 120 seconds timeout to prevent 499 TimeoutError
});

// Category Storage
const storageCategory = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'asbrand/categories',
    allowed_formats: ['jpg', 'png', 'jpeg'],
    transformation: [
      { width: 800, height: 800, crop: 'limit', quality: 'auto', fetch_format: 'auto' }
    ],
  },
});

const uploadCategory = multer({ storage: storageCategory });

// Product Storage
const storageProduct = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'asbrand/products',
    allowed_formats: ['jpg', 'png', 'jpeg'],
    transformation: [
      { width: 800, height: 800, crop: 'limit', quality: 'auto', fetch_format: 'auto' }
    ],
  },
});

const uploadProduct = multer({ storage: storageProduct, limits: { fileSize: 5 * 1024 * 1024 } });

// Poster Storage
const storagePoster = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'asbrand/posters',
    allowed_formats: ['jpg', 'png', 'jpeg'],
    transformation: [
      { width: 800, height: 800, crop: 'limit', quality: 'auto', fetch_format: 'auto' }
    ],
  },
});

const uploadPosters = multer({ storage: storagePoster });

// Review Storage
const storageReview = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'asbrand/reviews',
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
    transformation: [
      { width: 1000, height: 1000, crop: 'limit', quality: 'auto', fetch_format: 'auto' }
    ],
  },
});

const uploadReview = multer({ storage: storageReview });

// Document Storage
const storageDocument = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'asbrand/documents',
    allowed_formats: ['jpg', 'png', 'jpeg', 'pdf'],
  },
});

const uploadDocument = multer({ storage: storageDocument, limits: { fileSize: 10 * 1024 * 1024 } });

// Driver Photo Storage
const storageDriverPhoto = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'asbrand/drivers',
    allowed_formats: ['jpg', 'png', 'jpeg'],
    transformation: [
      { width: 400, height: 400, crop: 'fill', gravity: 'face', quality: 'auto', fetch_format: 'auto' }
    ],
  },
});

const uploadDriverPhoto = multer({ storage: storageDriverPhoto, limits: { fileSize: 5 * 1024 * 1024 } });

// Proof of Delivery Storage
const storageProofOfDelivery = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'asbrand/proof-of-delivery',
    allowed_formats: ['jpg', 'png', 'jpeg'],
    transformation: [
      { width: 1200, height: 1200, crop: 'limit', quality: 'auto', fetch_format: 'auto' }
    ],
  },
});

const uploadProofOfDelivery = multer({ storage: storageProofOfDelivery, limits: { fileSize: 10 * 1024 * 1024 } });

module.exports = {
  uploadCategory,
  uploadProduct,
  uploadPosters,
  uploadReview,
  uploadDocument,
  uploadDriverPhoto,
  uploadProofOfDelivery,
};
