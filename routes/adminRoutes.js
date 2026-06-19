const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const userController = require('../controllers/userController');
const authController = require('../controllers/authController');

// ─── Auth ─────────────────────────────────────────────────────────────────────
router.get('/login', authController.getLogin);
router.post('/login', authController.postLogin);
router.get('/logout', authController.logout);

// ─── Protected routes ────────────────────────────────────────────────────────
router.use(requireAdmin);

router.get('/',            userController.getDashboard);
router.get('/users',       userController.getUsers);
router.get('/logs',        userController.getLogs);

router.get('/users/:id/proof',     userController.viewProof);

router.post('/users/:id/approve',  userController.approveUser);
router.post('/users/:id/reject',   userController.rejectUser);
router.post('/users/:id/ban',      userController.banUser);
router.post('/users/:id/unban',    userController.unbanUser);

module.exports = router;
