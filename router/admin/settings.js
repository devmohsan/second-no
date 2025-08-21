const express = require('express');
const router = express.Router();
const auth = require('../../middleware/adminAuth');

const db = require('../../database/db');

router.get('/settings', auth, async (req, res) => {
    try {
        // Fetch all settings from the database
        const [setting] = await db.mySqlQury(
            'SELECT * FROM settings WHERE status = ?',
            ['active']
        );

        return res.render('settings', {
            setting,

        });
    } catch (err) {
        console.error('Error loading settings:', err);
        return res.status(500).render('error', { message: 'Failed to load settings' });
    }
});


router.post('/settings', auth, async (req, res) => {
    try {
        const {
            jwt_secret,
            smtp_user,
            smtp_pass,
            twilio_sid,
            twilio_authtoken,
            stripe_private_key,
            stripe_publishable_key,
            encryption_secret_key,
            coins_per_day_limit,
            status
        } = req.body;

        // // Validate required fields
        // if (!jwt_secret || !encryption_secret_key) {
        //     return res.status(400).json({
        //         success: false,
        //         message: 'JWT secret and Encryption key are required'
        //     });
        // }

        // Update settings in the database
        await db.mySqlQury(
            `UPDATE settings SET 
                jwt_secret = ?,
                smtp_user = ?,
                smtp_pass = ?,
                twilio_sid = ?,
                twilio_authtoken = ?,
                stripe_private_key = ?,
                stripe_publishable_key = ?,
                encryption_secret_key = ?,
                coins_per_day_limit = ?,
                status = ?,
                updated_at = NOW()
            WHERE status = 'active'`,
            [
                jwt_secret,
                smtp_user,
                smtp_pass,
                twilio_sid,
                twilio_authtoken,
                stripe_private_key,
                stripe_publishable_key,
                encryption_secret_key,
                coins_per_day_limit,
                status
            ]
        );

        return res.json({
            success: true,
            message: 'Settings updated successfully'
        });

    } catch (err) {
        console.error('Error updating settings:', err);
        return res.status(500).json({
            success: false,
            message: 'Failed to update settings',
            error: err.message
        });
    }
});

module.exports = router