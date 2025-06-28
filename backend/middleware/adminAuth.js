const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

const adminAuth = (req, res, next) => {
  let token;

  // 1. Try getting token from Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  // 2. If not, try getting token from Cookies
  if (!token && req.cookies && req.cookies.admin_token) {
    token = req.cookies.admin_token;
  }

  // 3. If token still not found
  if (!token) {
    return res.status(401).json({ message: 'No token, unauthorized' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.adminId = decoded.adminId;
    next();
  } catch (err) {
    res.status(403).json({ message: 'Invalid token' });
  }
};

module.exports = adminAuth;
