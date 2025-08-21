const express = require('express');
const router = express.Router();
const auth = require('../../middleware/adminAuth');

const db = require('../../database/db');


router.get('/dashboard', auth, async (req, res) => {
    try {
        // 1. Total users count
        const totalUsersResult = await db.mySqlQury(
            'SELECT COUNT(*) as total FROM users WHERE deleted_at IS NULL'
        );
        const totalUsers = totalUsersResult[0].total || 0;

        // 2. Active users count
        const activeUsersResult = await db.mySqlQury(
            'SELECT COUNT(*) as total FROM users WHERE is_active = 1 AND deleted_at IS NULL'
        );
        const activeUsers = activeUsersResult[0].total || 0;

        // 3. Active numbers count
        const activeNumbersResult = await db.mySqlQury(
            'SELECT COUNT(*) as total FROM purchased_no WHERE status = "active"'
        );
        const activeNumbers = activeNumbersResult[0].total || 0;

        // 4. Today's registered users
        const monthUsersResult = await db.mySqlQury(
            `SELECT COUNT(*) AS total
                FROM users
                WHERE MONTH(created_at) = MONTH(CURDATE())
                AND YEAR(created_at) = YEAR(CURDATE())
                AND deleted_at IS NULL`
        );

        const MonthlyUsers = monthUsersResult[0].total || 0;

        // 5. Today's purchased numbers
        const todayPurchasedNumbersResult = await db.mySqlQury(
            `SELECT COUNT(*) as total 
             FROM purchased_no 
                WHERE MONTH(created_at) = MONTH(CURDATE())
                AND YEAR(created_at) = YEAR(CURDATE())`
        );
        const todayPurchasedNumbers = todayPurchasedNumbersResult[0].total || 0;

        // 6. Number status counts for the doughnut chart
        const numberStatusResult = await db.mySqlQury(
            `SELECT 
                SUM(status = 'active') as active,
                SUM(status = 'inactive') as inactive,
                SUM(status = 'pending') as pending,
                SUM(status = 'released') as released
             FROM purchased_no`
        );
        const numberStatus = numberStatusResult[0];

        // Calculate yesterday's data for comparison (simplified example)
        const lastMonthUsersResult = await db.mySqlQury(
            `SELECT COUNT(*) AS total
     FROM users
     WHERE MONTH(created_at) = MONTH(CURDATE() - INTERVAL 1 MONTH)
       AND YEAR(created_at) = YEAR(CURDATE() - INTERVAL 1 MONTH)
       AND deleted_at IS NULL`
        );
        const lastmonthUsers = lastMonthUsersResult[0].total || 0;

        // Render with all data
        return res.render('dashboard', {
            counts: {
                totalUsers,
                activeUsers,
                activeNumbers
            },
            graphData: {
                MonthlyUsers,
                todayPurchasedNumbers,
                numberStatus,
                lastmonthUsers
            }
        });

    } catch (err) {
        console.error('Error loading dashboard:', err);
        return res.redirect('/login');
    }
});



module.exports = router