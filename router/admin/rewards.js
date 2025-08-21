const express = require('express');
const router = express.Router();
const auth = require('../../middleware/adminAuth');

const db = require('../../database/db');



router.get('/rewards', auth, async (req, res) => {
    try {
        const search = req.query.search || '';

        let rewards;
        if (search) {
            rewards = await db.mySqlQury(
                `SELECT * 
                        FROM rewards 
                        WHERE deleted_at IS NULL 
                            AND (title LIKE ? OR action_key LIKE ?) 
                        ORDER BY created_at DESC`,
                [`%${search}%`, `%${search}%`]
            );
        } else {
            rewards = await db.mySqlQury(
                `SELECT * 
                         FROM rewards  
                         WHERE deleted_at IS NULL 
                         ORDER BY created_at DESC`,
            );
        }



        return res.render('rewards', {
            rewards,
            query: req.query
        })
    } catch (error) {
        console.error('Error in Rewards route:', error.message);
        res.redirect('/admin/dashboard');
    }

})


router.post('/rewards/delete/:id', async (req, res) => {
    try {
        const rewardId = req.params.id;

        await db.mySqlQury(
            'UPDATE rewards SET deleted_at = NOW() WHERE id = ?',
            [rewardId]
        );

        res.redirect('/admin/rewards')
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Something went wrong' });
    }
});

router.get('/rewards/edit/:id', auth, async (req, res) => {
    const rewardId = req.params.id;
    try {
        const [reward] = await db.mySqlQury(
            'SELECT * FROM rewards WHERE deleted_at IS NULL AND id = ?',
            [rewardId]
        );

        return res.render('rewardEdit', {
            reward
        })
    } catch (error) {
        console.log('error in edit reward', error.message)
        return res.redirect('/admin/rewards')
    }


})

router.post('/rewards/update/:id', auth, async (req, res) => {
    const rewardId = req.params.id;
    const { title, description, status, coins } = req.body;
    try {

        console.log(coins)
        const finalStatus = status === 'active' ? 'active' : 'inactive';

        await db.mySqlQury(
            `UPDATE rewards 
       SET title = ?, description = ?, status = ?, coins = ?, updated_at = NOW()
       WHERE id = ?`,
            [title.trim(), description, finalStatus, coins, rewardId]
        );

        res.redirect('/admin/rewards');
    } catch (error) {
        console.error("Error updating reward:", err);
        return res.redirect('/admin/rewards')
    }
})

router.get('/rewards/add', auth, async (req, res) => {
    return res.render('rewardAdd')
})

router.post('/rewards/store', auth, async (req, res) => {
    try {
        const { title, description, coins, status } = req.body;

        const actionKey = title.trim().toLowerCase().replace(/\s+/g, '_');

        // ✅ Insert reward into DB
        await db.mySqlQury(
            `INSERT INTO rewards (action_key, title, description, coins, created_at, updated_at) 
   VALUES (?, ?, ?, ?, NOW(), NOW())`,
            [actionKey, title.trim(), description.trim(), coins]
        );

        res.redirect('/admin/rewards');
    } catch (error) {
        console.error("Error creating reward:", error);
        return res.redirect('/admin/rewards')
    }
})


module.exports = router