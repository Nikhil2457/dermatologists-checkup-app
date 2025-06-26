const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authMiddleware = async (req, res, next) => {
  try {
    let token;

    // 1. Try getting token from Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // 2. If not, try getting token from Cookies
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    // 3. If token still not found
    if (!token) {
      return res.status(401).json({ message: 'Authorization token missing' });
    }

    // 4. Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 5. Attach user to request
    req.user = await User.findById(decoded.id).select('-password');

    next();
  } catch (error) {
    console.error(error);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

module.exports = authMiddleware;
