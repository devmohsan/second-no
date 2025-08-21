const express = require('express');
const router = express.Router();
const auth = require('../../middleware/adminAuth');

const db = require('../../database/db');


router.get('/credit_packages', auth, async (req, res) => {
    try {

        const search = req.query.search || '';

        let credit_packages;
        if (search) {
            credit_packages = await db.mySqlQury(
                `SELECT * 
                        FROM credit_packages 
                        WHERE deleted_at IS NULL 
                            AND (name LIKE ?) 
                        ORDER BY created_at DESC`,
                [`%${search}%`]
            );
        } else {
            credit_packages = await db.mySqlQury(
                `SELECT * 
                         FROM credit_packages  
                         WHERE deleted_at IS NULL 
                         ORDER BY created_at DESC`,
            );
        }

        return res.render('creditPackages',
            {
                credit_packages,
                query: req.query
            }
        )

    } catch (error) {
        console.error('Error in credit Packages route:', error.message);
        res.redirect('/admin/dashboard');
    }

})


router.post('/credit_packages/delete/:id', async (req, res) => {
    try {
        const rewardId = req.params.id;

        await db.mySqlQury(
            'UPDATE credit_packages SET deleted_at = NOW() WHERE id = ?',
            [rewardId]
        );

        res.redirect('/admin/credit_packages')
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Something went wrong' });
    }
});

router.get('/credit_packages/edit/:id', auth, async (req, res) => {
    const rewardId = req.params.id;
    try {
        const [package] = await db.mySqlQury(
            'SELECT * FROM credit_packages WHERE deleted_at IS NULL AND id = ?',
            [rewardId]
        );

        return res.render('creditPackageEdit', {
            package
        })
    } catch (error) {
        console.log('error in edit reward', error.message)
        return res.redirect('/admin/credit_packages')
    }


})

router.post('/credit_packages/update/:id', auth, async (req, res) => {
    const packageId = req.params.id;
    const { name, credits, price, status } = req.body;

    try {
        // ✅ Clean status
        let finalStatus
        if (Array.isArray(status)) {
            finalStatus = status.includes('active') ? 'active' : 'inactive';
        } else {
            finalStatus = status === 'active' ? 'active' : 'inactive';
        }

        await db.mySqlQury(
            `UPDATE credit_packages 
             SET name = ?, credits = ?, price = ?, status = ?, updated_at = NOW()
             WHERE id = ?`,
            [name.trim(), credits, price, finalStatus, packageId]
        );

        res.redirect('/admin/credit_packages');
    } catch (error) {
        console.error("Error updating credit package:", error.message);
        return res.redirect('/admin/credit_packages');
    }
});


router.get('/credit_packages/add', auth, async (req, res) => {
    return res.render('creditPackageAdd')
})

router.post('/credit_packages/store', auth, async (req, res) => {
    const { name, credits, price} = req.body;

    try {
        // ✅ Clean status


        await db.mySqlQury(
            `INSERT INTO credit_packages (name, credits, price, created_at, updated_at) 
             VALUES (?, ?, ?, NOW(), NOW())`,
            [name.trim(), credits, price,]
        );

        res.redirect('/admin/credit_packages');
    } catch (error) {
        console.error("Error creating credit package:", error.message);
        return res.redirect('/admin/credit_packages');
    }
});


module.exports = router