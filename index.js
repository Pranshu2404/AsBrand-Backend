const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mongoose = require('mongoose');
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const asyncHandler = require('express-async-handler');
const dotenv = require('dotenv');
dotenv.config();

const app = express();
//?Middle wair
app.use(helmet())
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*'
}))
app.use(bodyParser.json());

//rateLimit
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, //ladle 15 minute ho gye
  max: 100 //each ip pe 100 request per windoms duga
})

app.use('/users/login', limiter);
app.use('/users/register', limiter);
app.use(express.json());
//? setting static folder path
app.use('/image/products', express.static('public/products'));
app.use('/image/category', express.static('public/category'));
app.use('/image/poster', express.static('public/posters'));

const URL = process.env.MONGO_URL;
mongoose.connect(URL);
const db = mongoose.connection;
db.on('error', (error) => console.error(error));
db.once('open', () => console.log('Connected to Database'));

// Routes
app.use('/categories', require('./routes/category'));
app.use('/subCategories', require('./routes/subCategory'));
app.use('/brands', require('./routes/brand'));
app.use('/variantTypes', require('./routes/variantType'));
app.use('/variants', require('./routes/variant'));
app.use('/products', require('./routes/product'));
app.use('/couponCodes', require('./routes/couponCode'));
app.use('/posters', require('./routes/poster'));
app.use('/users', require('./routes/user'));
app.use('/orders', require('./routes/order'));
app.use('/payment', require('./routes/payment'));
app.use('/notification', require('./routes/notification'));
app.use('/cart', require('./routes/cart'));
app.use('/wishlist', require('./routes/wishlist'));
app.use('/address', require('./routes/address'));

//add krege ab emi or kyc routes hehe
app.use('/emi', require('./routes/emi.js'))
app.use('/kyc', require('./routes/kyc.js'))
app.use('/merchant', require('./routes/merchant.js'))
app.use('/shipping', require('./routes/shipping.js'))
app.use('/reviews', require('./routes/review.js'))

// Initialize cron jobs



// Example route using asyncHandler directly in app.js
app.get('/', asyncHandler(async (req, res) => {
  res.json({ success: true, message: 'API working successfully', data: null });
}));

// Global error handler
app.use((error, req, res, next) => {
  res.status(500).json({ success: false, message: error.message, data: null });
});


app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);

  // Start cron jobs after server is running

});

