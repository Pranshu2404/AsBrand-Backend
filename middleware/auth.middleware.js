const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }
    // Extract token (remove "Bearer " prefix)
    const token = authHeader.split(' ')[1];

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach user info to request
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token.'
    });
  }
};
// Admin-only middleware
const adminMiddleware = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin only.'
    });
  }
  next();
};
// Supplier-only middleware (allows supplier + admin)
const supplierMiddleware = (req, res, next) => {
  if (req.user.role !== 'supplier' && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Supplier only.'
    });
  }
  next();
};
// Driver-only middleware
const driverMiddleware = (req, res, next) => {
  if (req.user.role !== 'driver' && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Driver only.'
    });
  }
  next();
};
module.exports = { authMiddleware, adminMiddleware, supplierMiddleware, driverMiddleware };
