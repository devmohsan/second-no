const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth')
const db = require('../database/db');



router.get('/user-dashboard', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Query user packages
    const userPackages = await db.mySqlQury(
      'SELECT * FROM user_packages WHERE user_id=?',
      [userId]
    );

    // If your db helper returns [rows, fields], use destructuring:
    // const [userPackages] = await db.mySqlQury(...);

    if (!userPackages || userPackages.length === 0) {
      return res.json({
        status: true,
        message: 'No packages found for the user.',
        userPackages: [],
      });
    }

    // Calculate totals
    const totals = userPackages.reduce(
      (acc, pkg) => {
        acc.remaining_minutes += pkg.remaining_minutes;
        acc.remaining_texts += pkg.remaining_texts;
        acc.remaining_credits += parseFloat(pkg.remaining_credits);
        return acc;
      },
      { remaining_minutes: 0, remaining_texts: 0, remaining_credits: 0 }
    );

    return res.json({
      status: true,
      message: 'Dashboard data fetched successfully',
      userPackages,
      totals,
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return res.status(500).json({ status: false, error: 'Server error' });
  }
});


module.exports = router
