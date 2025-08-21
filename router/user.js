const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth')
const sendEmail = require('../mail/mailer')
const db = require('../database/db');
const bcrypt = require('bcryptjs');
const fs = require('fs-extra');
const path = require("path");
const jwt = require('jsonwebtoken');

const mysql = require("mysql2");
const { error } = require('console');
function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}


router.post('/register', async (req, res) => {
    const { email, name, phone, password } = req.body;


    try {
        const [rows] = await db.mySqlQury(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );

        if (rows) {
            return res.json({
                status: false,
                message: "User Already Exist"
            })
        }
        const hashPassword = await bcrypt.hash(password, 10);

        const otp = generateOtp()
        const otpExpiry = new Date(Date.now() + 15 * 60 * 1000);

        const replacements = { email, otp }

        const filePath = path.join(__dirname, '..', 'email_templates', 'otp_template.html');
        const htmlTemplate = fs.readFileSync(filePath, 'utf8');

        const subject = "Account Verification"
        const sendmail = await sendEmail(email, subject, htmlTemplate, replacements)
        if (!sendmail) {
            return res.json({
                status: false,
                message: 'Failed to send OTP email'
            });
        }

        await db.mySqlQury(
            'INSERT INTO users (name, email, phone, password, otp, otp_expiry) VALUES (?, ?, ?, ?, ?, ?)',
            [name, email, phone, hashPassword, otp, otpExpiry]
        )
        return res.json({
            status: true,
            message: 'User registered successfully. OTP sent via email.'
        });
    } catch (error) {
        console.error('Registration Error:', error);
        return res.json({
            status: false,
            message: 'Server error during registration'
        });

    }
})

router.post('/activate-account', async (req, res) => {
    const { otp } = req.body;

    if (!otp) {
        return res.json({
            status: false,
            message: "OTP is a required field"
        });
    }

    try {
        const [rows] = await db.mySqlQury(
            'SELECT * FROM users WHERE otp = ?',
            [otp]
        );




        if (!rows) {
            return res.json({
                status: false,
                message: "Invalid OTP"
            });
        }

        const now = new Date();
        if (new Date(rows.otp_expiry) <= now) {
            return res.json({
                status: false,
                message: "OTP expired, please request a new one"
            });
        }

        const userId = rows.id;

        await db.mySqlQury(
            'UPDATE users SET otp = NULL, is_active = 1 WHERE id = ?',
            [userId]
        );

        return res.json({
            status: true,
            message: "Account activated successfully"
        });

    } catch (error) {
        console.error(error);
        return res.json({
            status: false,
            message: "Server error"
        });
    }
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body

    try {
        if (!email) {
            return res.json({
                status: false,
                message: "Email field required"
            });
        } else if (!password) {
            return res.json({
                status: false,
                message: "Password field required"
            });
        }

        const [user] = await db.mySqlQury(
            'SELECT * FROM users WHERE email = ?',
            [email]
        )

        if (!user) {
            return res.json({
                status: false,
                message: "user not found you need to sign up first"
            })
        }

        if (user.is_active != 1) {
            return res.json({
                status: false,
                message: "user is not verified"
            })
        }

        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.json({
                status: false,
                message: 'Invalid credentials.'
            });
        }

        const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, {
            expiresIn: '1d'
        });

        const userData = {
            id: user.id,
            email: user.email,
            name: user.name,
            status: user.is_active
        }

        return res.json({
            status: true,
            message: 'Login Successfully',
            token,
            userData
        })


    } catch (error) {
        console.log(error)
        return res.status(500).json({
            error: "Server Error"
        })

    }
})


router.post('/resend-otp', async (req, res) => {
    const { email } = req.body

    try {
        if (!email) {
            res.json({
                status: false,
                message: "email field required"
            })
        }

        const [user] = await db.mySqlQury('SELECT * FROM users WHERE email = ?', [email]);

        if (!user) {
            return res.json({
                status: false,
                message: "user not found"
            })
        }

        const otp = generateOtp();
        const otpExpiry = new Date(Date.now() + 15 * 60 * 1000);

        const filePath = path.join(__dirname, '..', 'email_templates', 'otp_template.html');
        const htmlTemplate = fs.readFileSync(filePath, 'utf8');
        const replacements = { email, otp }

        const subject = "Account Verification Otp Resent Request"
        const sendmail = await sendEmail(email, subject, htmlTemplate, replacements)
        if (!sendmail) {
            return res.json({
                status: false,
                message: 'Failed to send OTP email'
            });
        }

        await db.mySqlQury(
            'UPDATE users SET otp = ?, otp_expiry = ? WHERE id = ?',
            [otp, otpExpiry, user.id]
        );

        return res.json({
            status: false,
            message: "OTP resent Successfully! Check you email"
        })

    } catch (error) {
        console.log(error.message);
        return res.json({
            false: false,
            message: "server error"
        })

    }
})


router.post('/get-forgot-otp', async (req, res) => {
    const { email } = req.body;

    try {

        if (!email) {
            return res.json({
                status: false,
                message: 'email field is required'
            })
        }

        const [user] = await db.mySqlQury('SELECT * FROM users WHERE email = ?', [email])

        if(user.loginType !== null){
            return res.json({
                status:false,
                message: 'Invalid Email for forgot Password, try google or facebook login'
            })
        }

        if (!user) {
            return res.json({
                status: false,
                message: 'user not found'
            })
        }

        const otp = generateOtp();
        const otpExpiry = new Date(Date.now() + 15 * 60 * 1000);

        const filePath = path.join(__dirname, '..', 'email_templates', 'forgot_pass_template.html');
        const htmlTemplate = fs.readFileSync(filePath, 'utf8');
        const replacements = { email, otp }

        const subject = "Forgot password Otp Request"
        const sendmail = await sendEmail(email, subject, htmlTemplate, replacements)
        if (!sendmail) {
            return res.json({
                status: false,
                message: 'Failed to send OTP email'
            });
        }

        await db.mySqlQury(
            'UPDATE users SET forgot_otp = ?,  forgot_otp_expiry = ? WHERE id = ?',
            [otp, otpExpiry, user.id]
        );


        return res.json({
            status: true,
            message: "Otp Sent Successfully"
        })

    } catch (error) {
        console.log(error.message)
        return res.json({
            status: false,
            message: 'server error '
        })

    }
})


router.post('/verify-forgot-otp', async (req, res) => {
    const { otp } = req.body;

    if (!otp) {
        return res.json({
            status: false,
            message: "OTP is a required field"
        });
    }

    try {
        const [rows] = await db.mySqlQury(
            'SELECT * FROM users WHERE forgot_otp = ?',
            [otp]
        );
        if (!rows) {
            return res.json({
                status: false,
                message: "Invalid OTP"
            });
        }
        const now = new Date();
        if (new Date(rows.forgot_otp_expiry) <= now) {
            return res.json({
                status: false,
                message: "OTP expired, please request a new one"
            });
        }

        const userId = rows.id;

        await db.mySqlQury(
            'UPDATE users SET forgot_otp = NULL, forgot_otp_expiry = 1 WHERE id = ?',
            [userId]
        );

        return res.json({
            status: true,
            message: "forgot otp verified"
        });

    } catch (error) {
        console.error(error);
        return res.json({
            status: false,
            message: "Server error"
        });
    }
});


router.post('/reset-password', async (req, res) => {
    const { email, newPassword } = req.body;

    if (!email) {
        return res.json({
            status: false,
            message: 'Email  are required.'
        });
    } else if (!newPassword) {
        return res.json({
            status: false,
            message: 'newPassword are required'
        })
    }

    try {

        const [rows] = await db.mySqlQury('SELECT * FROM users WHERE email = ?', [email]);
        if (!rows) {
            return res.json({
                status: false,
                message: 'User not found.'
            });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);


        await db.mySqlQury('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, email]);

        res.json({
            status: true,
            message: 'Password reset successful.'
        });

    } catch (error) {
        console.error('Error resetting password:', error.message);
        res.json({
            status: false,
            message: 'Server error.'
        });
    }

})

router.post('/login-or-register', async (req, res) => {
    const { email, name, loginType, phone } = req.body;

    if (!email || !name || !loginType) {
        return res.json({
            status: false,
            message: 'Email, name, and loginType are required.'
        });
    }

    try {

        const [existingUsers] = await db.mySqlQury(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );
        let user;
        if (existingUsers) {
            // Update loginType and activate user
            user = existingUsers;
            await db.mySqlQury(
                'UPDATE users SET loginType = ?, is_active = 1 WHERE id = ?',
                [loginType, user.id]
            );

            // Refresh user data after update (optional)
            const [updatedUsers] = await db.mySqlQury(
                'SELECT * FROM users WHERE id = ?',
                [user.id]
            );
            user = updatedUsers;

        } else {
            // Create new user
            const insertResult = await db.mySqlQury(
                'INSERT INTO users (email, name, phone, loginType, is_active) VALUES (?, ?, ?, ?, 1)',
                [email, name, phone || null, loginType]
            );
            const newUserId = insertResult.insertId;

            // Retrieve new user info
            const [newUsers] = await db.mySqlQury(
                'SELECT * FROM users WHERE id = ?',
                [newUserId]
            );
            user = newUsers;
        }

        const tokenPayload = { id: user.id, email: user.email };
        const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
            expiresIn: '1d', // token expiry, adjust as needed
        });

        return res.status(200).json({
            status: true,
            message: 'Login  successfully',
            userData: {
                id: user.id,
                email: user.email,
                name: user.name,
                phone: user.phone,
                loginType: user.loginType,
                is_active: user.is_active,
            },
            token,
        });
    } catch (error) {
        console.log(error.message)
        return res.json({
            status:false
        })

    }
})


module.exports = router



