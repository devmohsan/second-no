const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth')
const db = require('../database/db');



router.get('/user-dashboard', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Query user packages
    const userPackages = await db.mySqlQury(
      `SELECT up.*, pn.number AS purchased_number, pn.c_name
       FROM user_packages up
       LEFT JOIN purchased_no pn ON up.num_id = pn.id
       WHERE up.user_id = ? AND up.status = ?`,
      [userId, 'active']
    );

      const purchasedNumbers = userPackages
      .filter(pkg => pkg.purchased_number) // Only those with a purchased number
      .map(pkg => ({
        id: pkg.num_id,
        number: pkg.purchased_number,
        c_name: pkg.c_name,
        expiry_date: pkg.end_date


      }));

    if (!userPackages || userPackages.length === 0) {
      return res.json({
        status: true,
        message: 'No packages found for the user.',
        userPackages: [],
      });
    }

    const [user]= await db.mySqlQury(
      'SELECT * FROM users WHERE id= ?',
      [userId]
    )

    // Calculate totals

    const totals={
       remainingCredits: user.credits,
       remainingCoins: user.coins

    }


    return res.json({
      status: true,
      message: 'Dashboard data fetched successfully',
      userPackages,
      purchasedNumbers,
      totals
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return res.json({ status: false, message: 'Server error' });
  }
});


module.exports = router
