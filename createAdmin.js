const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./model/user');

dotenv.config();

const createAdmin = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URL);
        console.log('Connected to Database');

        const adminEmail = 'admin@example.com';
        const adminPassword = 'adminpassword123';
        const adminPhone = '0000000000';

        let user = await User.findOne({ email: adminEmail });

        if (user) {
            console.log('Admin user already exists');
            user.role = 'admin';
            await user.save();
            console.log('Updated existing user role to admin');
        } else {
            user = new User({
                name: 'Admin User',
                email: adminEmail,
                phone: adminPhone,
                password: adminPassword,
                role: 'admin'
            });
            await user.save();
            console.log('Created new admin user');
        }

        console.log('-----------------------------------');
        console.log('Admin User Ready:');
        console.log(`Email: ${adminEmail}`);
        console.log(`Password: ${adminPassword}`);
        console.log('-----------------------------------');
        console.log('Use these credentials to Login via POST /users/login to get your Token.');

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

createAdmin();
