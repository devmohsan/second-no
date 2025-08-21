const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth')
const db = require('../database/db');
const auth = require('../middleware/adminAuth');



router.get('/', authenticateToken, async (req, res) => {
    try {
        const rewards = await db.mySqlQury(
            'SELECT * FROM rewards WHERE status = ? ',
            ['active']
        );

        return res.json({
            status: true,
            message: 'Active rewards fetched successfully',
            rewards
        });
    } catch (error) {

        console.log(error.message)
        return res.json({
            status: false,
            message: 'Server error',
            error: error.message
        });

    }
})


router.post('/collect-reward', authenticateToken, async (req, res) => {
    const { rewardId, userId } = req.body;

    if (!rewardId || !userId) {
        return res.json({
            status: false,
            message: 'rewardId and userId are required'
        });
    }

    try {
        // 1️⃣ Get the user
        const [user] = await db.mySqlQury(
            'SELECT * FROM users WHERE id = ?',
            [userId]
        );

        if (!user) {
            return res.json({
                status: false,
                message: 'User not found'
            });
        }

        const [reward] = await db.mySqlQury(
            'SELECT * FROM rewards WHERE id = ? AND status = "active"',
            [rewardId]
        );

        if (!reward) {
            return res.json({
                status: false,
                message: 'Reward not found or inactive'
            });
        }

        const todayCoinsResult = await db.mySqlQury(
            `SELECT IFNULL(SUM(coins), 0) AS total_coins
             FROM reward_history
             WHERE userId = ? 
             AND DATE(created_at) = CURDATE()`,
            [userId]
        );

        const todayCoins = todayCoinsResult[0].total_coins || 0;

        const [settings] = await db.mySqlQury(
            'SELECT * FROM settings LIMIT 1'
        );

        if (!settings) {
            return res.json({
                status: false,
                message: 'Settings not found'
            });
        }

        // 5️⃣ Check daily limit
        if (todayCoins >= settings.coins_per_day_limit) {
            return res.json({
                status: false,
                message: "Today's rewards limit reached"
            });
        }

        if (todayCoins + reward.coins > settings.coins_per_day_limit) {
            return res.json({
                status: false,
                message: "Collecting this reward would exceed today's coin limit"
            });
        }
        const newCoinBalance = (user.coins || 0) + reward.coins;

        await db.mySqlQury(
            'UPDATE users SET coins = ? WHERE id = ?',
            [newCoinBalance, userId]
        );

        // 7️⃣ Insert into reward_history
        await db.mySqlQury(
            'INSERT INTO reward_history (userId, reward_id, coins) VALUES (?, ?, ?)',
            [userId, rewardId, reward.coins]
        );

        return res.json({
            status: true,
            message: 'Reward collected successfully',
            coins_added: reward.coins,
            current_balance: newCoinBalance
        });


    } catch (error) {

        console.error(error);
        return res.json({
            status: false,
            message: 'Server error',
            error: error.message
        });

    }
})


router.get('/coin-offers', authenticateToken, async (req, res) => {
    try {

        let page = parseInt(req.query.page) || 1;
        let limit = parseInt(req.query.limit) || 10;
        let offset = (page - 1) * limit;

        const [countRows] = await db.mySqlQury(
            `SELECT COUNT(*) as total FROM coin_offers WHERE status = 'active'`
        );
        const total = countRows.total;

        const rows = await db.mySqlQury(
            `
      SELECT *
      FROM coin_offers
      WHERE status = 'active'
      ORDER BY id DESC
      LIMIT ? OFFSET ?
      `,
            [limit, offset]
        );

        return res.json({
            status: true,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalRecord: total,
            data: rows

        })

    } catch (error) {
        console.log(error.message)
        return res.json({
            status: false,
            message: `server error: ${error.message}`
        })

    }
})


// const db = require('../db'); // make sure path is correct

router.post('/claim_offer', authenticateToken, async (req, res) => {
    const { offer_id, expiredNumber_id } = req.body;
    const user_id = req.user.id;

    if (!offer_id || !expiredNumber_id) {
        return res.json({
            status: false,
            message: "offer_id and expiredNumber_id are required"
        });
    }

    let conn;
    try {
        conn = await db.promisePool.getConnection();
        await conn.beginTransaction();

        // Step 1: Get user
        const [userRows] = await conn.query(
            `SELECT id, coins FROM users WHERE id = ? FOR UPDATE`,
            [user_id]
        );
        if (userRows.length === 0) {

            return res.json({
                status: false,
                message: 'User not found'
            })
        }
        const user = userRows[0];

        // Step 2: Get offer
        const [offerRows] = await conn.query(
            `SELECT id, coins_required, reward_value FROM coin_offers WHERE id = ?`,
            [offer_id]
        );
        if (offerRows.length === 0) {

            return res.json({
                status: false,
                message: 'Offer not found'
            })
        }
        const offer = offerRows[0];

        // Step 3: Check coins
        if (offer.coins_required > user.coins) {
            await conn.rollback();
            return res.json({
                status: false,
                message: "Insufficient coins"
            });
        }

        // Step 4: Check expired number is active
        const [expNumRows] = await conn.query(
            `SELECT id,exp_numId, status FROM expired_numbers WHERE id = ? FOR UPDATE`,
            [expiredNumber_id]
        );
        if (expNumRows.length === 0) {
            return res.json({
                status: false,
                message: 'Expired number not found'
            })
        }
        if (expNumRows[0].status !== 'active') {
            await conn.rollback();
            return res.json({
                status: false,
                message: `Already assigned number`
            });
        }

        // Step 5: Find purchased number for mapping
        const [purchasedRows] = await conn.query(
            `SELECT id FROM purchased_no WHERE id = ?`,
            [expNumRows[0].exp_numId]
        );
        if (purchasedRows.length === 0) {
            return res.json({
                status: false,
                message: 'Purchased number not found for this expired number'
            })
        }
        const purchasedNoId = purchasedRows[0].id;

        // Step 6: Deduct coins from user
        await conn.query(
            `UPDATE users SET coins = coins - ? WHERE id = ?`,
            [offer.coins_required, user_id]
        );

        // Step 7: Insert into expired_number_users
        const [expUserResult] = await conn.query(
            `INSERT INTO expired_number_users (exp_num_id, user_id, created_at)
             VALUES (?, ?, NOW())`,
            [expiredNumber_id, user_id]
        );

        // Step 8: Mark expired_numbers as inactive
        await conn.query(
            `UPDATE expired_numbers SET status = 'inactive' WHERE id = ?`,
            [expiredNumber_id]
        );

        // Step 9: Calculate end_date (reward_value = days to add)
        let endDate = null;
        if (offer.reward_value && !isNaN(offer.reward_value)) {
            endDate = new Date();
            endDate.setDate(endDate.getDate() + parseInt(offer.reward_value));
        }

        // Step 10: Insert into user_packages
        const [pkgResult] = await conn.query(
            `INSERT INTO user_packages 
                (user_id, num_id, coin_offer_id, status, created_at, source_type, end_date)
             VALUES (?, ?, ?, 'active', NOW(), 'coin_offer', ?)`,
            [user_id, purchasedNoId, offer_id, endDate]
        );

        // Commit transaction
        await conn.commit();

        return res.json({
            status: true,
            message: "Offer claimed successfully",
            expired_number_user_id: expUserResult.insertId,
            user_package_id: pkgResult.insertId
        });

    } catch (error) {
        if (conn) await conn.rollback();
        console.error("Error in /claim_offer:", error);
        return res.json({
            status: false,
            message: `Server error: ${error.message}`
        });
    } finally {
        if (conn) conn.release();
    }
});




module.exports = router