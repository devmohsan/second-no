const express = require('express');
const router = express.Router();
const auth = require('../../middleware/adminAuth');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../database/db');

const secretKey = process.env.JWT_SECRET;


router.get('/', async (req, res) => {
    return res.render('login')
})


router.post('/admin/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                status: false,
                message: 'Email and password are required.'
            });
        }

        const [user] = await db.mySqlQury(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );

        if (!user) {
            return res.status(401).json({
                status: false,
                message: 'Invalid email or password.'
            });
        }

        // ✅ Check if user is admin
        if (user.user_type !== 'admin') {
            return res.status(403).json({
                status: false,
                message: 'Access denied. Only admins can login.'
            });
        }

        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.status(401).json({
                status: false,
                message: 'Invalid email or password.'
            });
        }

        const token = jwt.sign(
            {
                id: user.id,
                email: user.email,
                name: user.name,
                user_type: user.user_type
            },
            secretKey,
            { expiresIn: '1d' }
        );

        res.cookie('token', token, {
            httpOnly: true,
            secure: false, // true in production with HTTPS
            maxAge: 24 * 60 * 60 * 1000, // 1 day
        });

        return res.json({
            status: true,
            redirect: '/admin/dashboard'
        });

    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({
            status: false,
            message: 'Something went wrong. Please try again.'
        });
    }
});

router.post('/admin/logout', (req, res) => {
    res.clearCookie('token'); // Clear JWT token cookie
    res.redirect('/'); // Redirect to login or home page
});

module.exports = router