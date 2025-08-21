const express = require('express');
const router = express.Router();
const auth = require('../../middleware/adminAuth');

const db = require('../../database/db');


router.get('/packages', auth, async (req, res) => {
    try {

        const search = req.query.search || '';

        let packages;
        if (search) {
            packages = await db.mySqlQury(
                `SELECT * 
                        FROM packages 
                        WHERE deleted_at IS NULL 
                            AND (name LIKE ?) 
                        ORDER BY created_at DESC`,
                [`%${search}%`]
            );
        } else {
            packages = await db.mySqlQury(
                `SELECT * 
                         FROM packages  
                         WHERE deleted_at IS NULL 
                         ORDER BY created_at DESC`,
            );
        }

        return res.render('packages',
            {
                packages,
                query: req.query
            }
        )

    } catch (error) {
        console.error('Error in credit Packages route:', error.message);
        res.redirect('/admin/dashboard');
    }

})


router.post('/packages/delete/:id', async (req, res) => {
    try {
        const rewardId = req.params.id;

        await db.mySqlQury(
            'UPDATE packages SET deleted_at = NOW() WHERE id = ?',
            [rewardId]
        );

        res.redirect('/admin/packages')
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Something went wrong' });
    }
});

router.get('/packages/edit/:id', auth, async (req, res) => {
    const rewardId = req.params.id;
    try {
        const [package] = await db.mySqlQury(
            'SELECT * FROM packages WHERE deleted_at IS NULL AND id = ?',
            [rewardId]
        );

        return res.render('packageEdit', {
            package
        })
    } catch (error) {
        console.log('error in edit reward', error.message)
        return res.redirect('/admin/packages')
    }


})

router.post('/packages/update/:id', auth, async (req, res) => {
    const packageId = req.params.id;
    const { name, price, validity_days, status } = req.body;

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
            `UPDATE packages 
             SET name = ?, price = ?, validity_days = ?, status = ?, updated_at = NOW()
             WHERE id = ?`,
            [name.trim(), price, validity_days, finalStatus, packageId]
        );

        res.redirect('/admin/packages');
    } catch (error) {
        console.error("Error updating package:", error.message);
        return res.redirect('/admin/packages');
    }
});

router.get('/packages/add', auth, async (req, res) => {
    return res.render('packageAdd')
})

router.post('/packages/store', auth, async (req, res) => {
    try {
        const { name, price, validity_days} = req.body;

 

        await db.mySqlQury(
            `INSERT INTO packages (name, price, validity_days, created_at, updated_at) 
             VALUES (?, ?, ?,NOW(), NOW())`,
            [name.trim(), price, validity_days,]
        );

        res.redirect('/admin/packages');
    } catch (error) {
        console.error("Error creating package:", error.message);
        return res.redirect('/admin/packages');
    }
});


module.exports = router