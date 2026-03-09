require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/authRoutes');
const homeRoutes = require('./routes/homeRutes');
const app = express();
const PORT = process.env.PORT || 3000;
app.use(helmet());
app.use(cors({
    origin:'*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts. Please try again in 15 minutes.',
  },
});
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/api/auth', loginLimiter, authRoutes);
app.get('/api/health', (req, res) => {
  res.json({
    status:    'ok',
    project:   'Baladiyati API',
    timestamp: new Date().toISOString(),
  });
});
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found.' });
});
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]', err);
  res.status(500).json({ success: false, message: 'Internal server error.' });
});
app.use('/api/home', homeRoutes);
app.listen(PORT, () => {
  console.log(`Baladiyati API  →  http://localhost:${PORT}`);
});
module.exports = app;