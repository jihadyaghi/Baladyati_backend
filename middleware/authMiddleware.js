const jwt = require('jsonwebtoken');
module.exports = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No token provided.',
    });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'citizen') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Citizen token required.',
      });
    }
    req.citizenId = decoded.id;
    next();
  } catch (err) {
    const message =
      err.name === 'TokenExpiredError'
        ? 'Session expired. Please log in again.'
        : 'Invalid token.';
    return res.status(401).json({ success: false, message });
  }
};
