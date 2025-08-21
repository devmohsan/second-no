const express = require('express');
const router = express.Router();
const auth = require('../../middleware/adminAuth');

const db = require('../../database/db');

const upload = require('../../uploadConfig')

const fs = require('fs');
const path = require('path');

// router.get('/users', auth, async (req, res) => {
//     try {
//         // Example: get all users

//         const users = await db.mySqlQury(
//             'SELECT * FROM users WHERE deleted_at IS NULL AND user_type != ? ORDER BY created_at DESC',
//             ['admin']
//         );


//         res.render('users', {
//             users,
//             query: req.query, // for pagination
//         });

//     } catch (err) {
//         console.error('Error in users route:', err);

//         res.redirect('/dashboard');
//     }
// });

router.get('/users', auth, async (req, res) => {
    try {
        const search = req.query.search || ''; // search text from query string

        let users;
        if (search) {
            users = await db.mySqlQury(
                `SELECT * 
                 FROM users 
                 WHERE deleted_at IS NULL 
                   AND user_type != ? 
                   AND (name LIKE ? OR email LIKE ?)
                 ORDER BY created_at DESC`,
                ['admin', `%${search}%`, `%${search}%`]
            );
        } else {
            users = await db.mySqlQury(
                `SELECT * 
                 FROM users 
                 WHERE deleted_at IS NULL 
                   AND user_type != ? 
                 ORDER BY created_at DESC`,
                ['admin']
            );
        }

        res.render('users', {
            users,
            query: req.query, // keep search query in view
        });

    } catch (err) {
        console.error('Error in users route:', err);
        res.redirect('/dashboard');
    }
});


// Soft delete user
router.post('/users/delete/:id', async (req, res) => {
    try {
        const userId = req.params.id;

        await db.mySqlQury(
            'UPDATE users SET deleted_at = NOW() WHERE id = ?',
            [userId]
        );

        res.redirect('/admin/users')
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Something went wrong' });
    }
});


router.get('/users/view/:id', auth, async (req, res) => {
    try {
        const userId = req.params.id;

        // Fetch user (only if not soft deleted)
        const [user] = await db.mySqlQury(
            'SELECT * FROM users WHERE id = ? AND deleted_at IS NULL',
            [userId]
        );

        if (!user) {
            return res.status(404).send("User not found or deleted");
        }

        // Fetch user packages with purchased numbers
        const userPackages = await db.mySqlQury(
            `SELECT up.id AS package_id, 
                    up.start_date AS package_date,
                    up.source_type,
                    up.end_date,
                    up.status,
                    pn.id AS number_id,
                    pn.number AS purchased_number
             FROM user_packages up
             INNER JOIN purchased_no pn ON up.num_id = pn.id
             WHERE up.user_id = ?`,
            [userId]
        );

        // Split into rewarded vs purchased
        const rewardedPackages = userPackages.filter(pkg => pkg.source_type === 'coin_offer');
        const purchasedPackages = userPackages.filter(pkg => pkg.source_type !== 'coin_offer');

        // Render view with separated sections
        res.render('userView', { 
            user, 
            rewardedPackages,
            purchasedPackages
        });

    } catch (error) {
        console.error(error);
        res.status(500).send("Server Error");
    }
});




router.get('/users/edit/:id', auth, async (req, res) => {
    try {
        const userId = req.params.id;

        // MySQL query to fetch user (only if not soft deleted)
        const [user] = await db.mySqlQury(
            'SELECT * FROM users WHERE id = ? AND (deleted_at IS NULL)',
            [userId]
        );

        if (!user) {
            return res.status(404).send("User not found or deleted");
        }

        // Render view and send user data
        res.render('userEdit', { user: user });

    } catch (error) {
        console.error(error);
        res.status(500).send("Server Error");
    }
});

router.post('/users/update/:id', auth, upload.single('profile_image'), async (req, res) => {
    const userId = req.params.id;
    const { name, phone, is_active } = req.body;

    try {
        // 1️⃣ Fetch existing user
        const [existingUser] = await db.mySqlQury(
            'SELECT * FROM users WHERE id = ? AND deleted_at IS NULL',
            [userId]
        );

        if (!existingUser) {
            if (req.file) fs.unlinkSync(req.file.path);
            return res.status(404).send("User not found or deleted");
        }

        // 2️⃣ Handle profile image
        let profileImagePath = existingUser.profile_image || '/avatar.jpg'; // default
        if (req.file) {
            profileImagePath = '/uploads/' + req.file.filename;

            // Delete old image if not default avatar
            if (existingUser.profile_image && !existingUser.profile_image.includes('avatar.jpg')) {
                const oldImagePath = path.join(__dirname, '../public', existingUser.profile_image);
                if (fs.existsSync(oldImagePath)) fs.unlinkSync(oldImagePath);
            }
        }

        // 3️⃣ Update user in DB
        await db.mySqlQury(
            `UPDATE users SET 
                name = ?, 
                phone = ?, 
                profile_image = ?, 
                is_active = ?, 
                updated_at = NOW() 
             WHERE id = ?`,
            [
                name,
                phone || null,
                profileImagePath,
                is_active === 'on' ? 1 : 0,
                userId
            ]
        );


        res.redirect(`/admin/users/edit/${userId}`);

    } catch (error) {
        console.error('Error updating user:', error);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.redirect(`/admin/users/edit/${userId}`);
    }
});


// Release number (Twilio + DB update)
router.post('/numbers/cancel/:id', auth, async (req, res) => {
  try {
    const numId = req.params.id;

    // Find number SID from DB
    const [number] = await db.mySqlQury("SELECT * FROM purchased_no WHERE  id = ?", [numId]);
    if (!number) return res.status(404).json({ message: "Number not found" });

    // Update DB (mark inactive or delete package mapping)
    await db.mySqlQury("UPDATE user_packages SET status='cancelled' WHERE num_id = ?", [numId]);

    res.json({ message: `Number ${number.number} cancelled successfully` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error releasing number" });
  }
});

// Reassign number (placeholder logic)
router.post('/numbers/reassign/:id', auth, async (req, res) => {
  try {
    const numId = req.params.id;

    // Example: mark status as reassigned
    await db.mySqlQury("UPDATE user_packages SET status='active' WHERE num_id = ?", [numId]);

    res.json({ message: `Number ID ${numId} reassigned successfully` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error reassigning number" });
  }
});


module.exports = router