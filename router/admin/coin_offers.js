const express = require('express');
const router = express.Router();
const auth = require('../../middleware/adminAuth');

const db = require('../../database/db');



router.get('/coin_offers', auth, async (req, res) => {
    try {

        const search = req.query.search || '';

        let coin_offers;
        if (search) {
            coin_offers = await db.mySqlQury(
                `SELECT * 
                        FROM coin_offers 
                        WHERE deleted_at IS NULL 
                            AND (name LIKE ?) 
                        ORDER BY created_at DESC`,
                [`%${search}%`]
            );
        } else {
            coin_offers = await db.mySqlQury(
                `SELECT * 
                         FROM coin_offers  
                         WHERE deleted_at IS NULL 
                         ORDER BY created_at DESC`,
            );
        }

        return res.render('coinOffers',
            {
                coin_offers,
                query: req.query
            }
        )

    } catch (error) {
        console.error('Error in Rewards route:', error.message);
        res.redirect('/admin/dashboard');
    }

})


router.post('/coin_offers/delete/:id', async (req, res) => {
    try {
        const rewardId = req.params.id;

        await db.mySqlQury(
            'UPDATE coin_offers SET deleted_at = NOW() WHERE id = ?',
            [rewardId]
        );

        res.redirect('/admin/coin_offers')
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Something went wrong' });
    }
});

router.get('/coin_offers/edit/:id', auth, async (req, res) => {
    const rewardId = req.params.id;
    try {
        const [coinOffer] = await db.mySqlQury(
            'SELECT * FROM coin_offers WHERE deleted_at IS NULL AND id = ?',
            [rewardId]
        );

        return res.render('coinOfferEdit', {
            coinOffer
        })
    } catch (error) {
        console.log('error in edit reward', error.message)
        return res.redirect('/admin/coin_offers')
    }


})

router.post('/coin_offers/update/:id', auth, async (req, res) => {
    const rewardId = req.params.id;
    const { name, coins_required, reward_type, reward_value, status } = req.body;

    try {
        console.log(status)
        let finalStatus
        if (Array.isArray(status)) {
            finalStatus = status.includes('active') ? 'active' : 'inactive';
        } else {
            finalStatus = status === 'active' ? 'active' : 'inactive';
        }

        console.log(finalStatus)

        await db.mySqlQury(
            `UPDATE coin_offers 
             SET name = ?, coins_required = ?, reward_type = ?, reward_value = ?, status = ?, updated_at = NOW()
             WHERE id = ?`,
            [name.trim(), coins_required, reward_type, reward_value, finalStatus, rewardId]
        );

        res.redirect('/admin/coin_offers');
    } catch (error) {
        console.error("Error updating coin offer:", error.message);
        return res.redirect('/admin/coin_offers');
    }
});


router.get('/coin_offers/add', auth, async (req, res) => {
    return res.render('coinOfferAdd')
})

router.post('/coin_offers/store', auth, async (req, res) => {
    try {
        const { name, coins_required, reward_value} = req.body;

        await db.mySqlQury(
            `INSERT INTO coin_offers 
             (name, coins_required, reward_type, reward_value, created_at, updated_at) 
             VALUES (?, ?, ?, ?, NOW(), NOW())`,
            [name.trim(), coins_required, 'reassign_number', reward_value]
        );

        res.redirect('/admin/coin_offers');
    } catch (error) {
        console.error("Error creating coin offer:", error.message);
        return res.redirect('/admin/coin_offers');
    }
});


module.exports = router