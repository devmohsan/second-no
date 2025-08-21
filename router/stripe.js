const express = require('express');
const router = express.Router();
const db = require('../database/db');
const stripe = require('stripe')(process.env.STRIP_PRIVATE_KEY);
const twilio = require('twilio');
const authenticateToken = require('../middleware/auth');
const crypto = require('crypto');
const { status } = require('express/lib/response');


const accountSId = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_AUTHTOKEN;

const client = twilio(accountSId, authToken);

const algorithm = 'aes-256-cbc';
const keyHex = process.env.SECRET_KEY?.trim(); // Remove spaces/newlines

if (!keyHex || keyHex.length !== 64) {
    throw new Error('SECRET_KEY must be exactly 64 hex characters (32 bytes) for AES-256');
}

const secretKey = Buffer.from(keyHex, 'hex');


// function encrypt(text) {
//     const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
//     let encrypted = cipher.update(text, 'utf8', 'hex');
//     encrypted += cipher.final('hex');
//     return { iv: iv.toString('hex'), encryptedData: encrypted };
// }

function encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Join IV and encrypted text with a colon
    return iv.toString('hex') + ':' + encrypted;
}


function decrypt(encryptedString) {
    const [ivHex, encryptedHex] = encryptedString.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(algorithm, secretKey, iv);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}


router.get('/buy-number/:id', async (req, res) => {
    const { id } = req.params;

    const packId = decrypt(id)

    console.log(typeof packId)
    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;

    const packages = await db.mySqlQury(
        'SELECT * FROM packages WHERE status=?',
        ['active']
    )

    const [userPackage] = await db.mySqlQury(
        'SELECT * FROM user_packages WHERE id = ?',
        [packId]
    );


    const userId = userPackage.user_id

    const nmbrId = userPackage.num_id

    const number = await db.mySqlQury(
        'SELECT number, c_name FROM purchased_no WHERE id =?',
        [nmbrId]
    )


    console.log(number[0].number)
    res.render('stripe', {
        publishableKey,
        userId,
        packages,
        number: number[0].number,
        countryCode: number[0].c_name,
        nmbrId
    });
});

router.post('/buy-number', authenticateToken, async (req, res) => {

    const { number, countryCode, region } = req.body
    const userId = req.user.id;

    if (!number || !countryCode || !region) {
        return res.json({
            status: false,
            message: 'all fields are required number, countryCode, region'
        })
    }

    try {

        // console.log(req.body)
        const availableNumbers = await client
            .availablePhoneNumbers(countryCode)
            .local.list({
                contains: number, // Search without country code
            });

        if (availableNumbers.length === 0) {
            return res.json({
                status: false,
                message: 'No matching number found in Twilio inventory'
            });
        }
        const purchaseResult = await db.mySqlQury(
            `INSERT INTO purchased_no (c_name, r_name, number, status) VALUES (?, ?, ?, ?)`,
            [
                countryCode, // Replace with actual user's name
                region || "",
                number,
                "pending"
            ]
        )

        const purchasedNoId = purchaseResult.insertId;
        const status = 'pending'
        const packagePurchase = await db.mySqlQury(
            'INSERT INTO user_packages (user_id,num_id,status) VALUES (?, ?, ?)',
            [userId, purchasedNoId, status]
        )

        const packId = packagePurchase.insertId
        console.log(packId)
        const encryptedId = encrypt(packId.toString());

        return res.json({
            status: false,
            message: 'data added successfully',
            id: encryptedId
        })

    } catch (error) {

        console.log(error.message)
        return res.json({
            status: false,
            messsage: 'server error '
        })
    }

})


async function buySpecificNumber(countryCode, localNumber, req) {
    try {
        // Step 1: Search available numbers
        const availableNumbers = await client
            .availablePhoneNumbers(countryCode)
            .local.list({
                contains: localNumber, // Search without country code
            });

        if (availableNumbers.length === 0) {
            return {
                status: false,
                message: 'No matching number found in Twilio inventory'
            };
        }

        const numberToBuy = availableNumbers[0].phoneNumber;

        const protocol = req.protocol;  // 'http' or 'https'
        const host = req.get('host');   // domain + port if any

        const baseUrl = `${protocol}://${host}`;
        const smsUrl = `${baseUrl}/twilio/incoming-message`;

        // Step 2: Purchase the number
        const purchasedNumber = await client.incomingPhoneNumbers.create({
            phoneNumber: numberToBuy,
            smsUrl: smsUrl
        });

        return {
            status: true,
            data: {
                sid: purchasedNumber.sid,
                friendly_name: purchasedNumber.friendlyName,
                phone_number: purchasedNumber.phoneNumber,
                capabilities: purchasedNumber.capabilities
            }
        };

    } catch (error) {
        return {
            status: false,
            message: error.message
        };
    }
}


router.post('/createCharges', async (req, res) => {
    const { userId, packageId, num_id, number, countryCode, stripeToken, amount } = req.body

    // console.log(req.body)

    if (!userId || !packageId || !stripeToken) {
        return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    try {
        const [package] = await db.mySqlQury(
            'SELECT * FROM packages WHERE id = ?',
            [packageId]
        )

        const validity = package.validity_days
        const start_date = new Date()

        let end_date = new Date(start_date)

        end_date.setDate(end_date.getDate() + validity)

        if (!package) {
            res.status(400).json({
                success: false,
                message: "selected Package not found please select different one "
            })
        }

        // const selectedNumber = await buySpecificNumber(countryCode, number, req);

        // if (!selectedNumber.status) {

        //     return res.status(400).json({
        //         success: false,
        //         message: selectedNumber.message
        //     })

        // }
        const charge = await stripe.charges.create({
            amount: parseInt(amount) * 100,
            currency: 'usd',
            source: stripeToken,
            description: `Amount `
        });

        // console.log(remaining_minutes)
        if (charge && charge.status === 'succeeded') {
            //             await db.mySqlQury(
            //     `UPDATE purchased_no SET status = ?, sid = ? WHERE id = ?`,
            //     ["active", selectedNumber.data.sid, num_id]
            // );

            await db.mySqlQury(
                `UPDATE purchased_no SET status = ?, sid = ? WHERE id = ?`,
                ["active", 'SID1234567898765432', num_id]
            );
            await db.mySqlQury(
                `UPDATE user_packages 
                 SET package_id = ?, start_date = ?, end_date = ?, status = ? 
                 WHERE num_id = ? AND user_id = ?`,
                [packageId, start_date, end_date, "active", num_id, userId]
            );
        }
        return res.status(201).json({
            status: true,
            message: "Payment Successfully"
        })
    } catch (error) {
        console.log(error.message)
        return res.status(500).json({
            error: "server error "
        })
    }


})

router.get('/success', async (req, res) => {
    res.render('success')
})


router.post('/buy-credits', authenticateToken, async (req, res) => {

    const { packId, userId } = req.body

    if (!userId) {
        return res.json({
            status: false,
            message: 'userId is required  field'
        })
    }



    try {

        let encryptedPackId = '';
        if (packId) {
            encryptedPackId = encrypt(packId.toString());
        }

        const encrypteduserId = encrypt(userId.toString())

        return res.json({
            status: true,
            message: 'encryption successfully!',
            packageId: encryptedPackId,
            user: encrypteduserId
        })

    } catch (error) {
        console.log(error.message)
        return res.json({
            status: false,
            message: 'serve error '
        })

    }

})

router.get('/buy-Credit', async (req, res) => {
    const { userId, packageId } = req.query


    // console.log(packageId, userId)
    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;

    const decryptedUserId = decrypt(userId)
    const decryptedpackId = decrypt(packageId)

    const activerpackages = await db.mySqlQury(
        'SELECT * FROM credit_packages WHERE status=?',
        ['active']
    )

    res.render('buyCredit', {
        publishableKey,
        selectpackage: decryptedpackId,
        user: decryptedUserId,
        activerpackages
    })
})


router.post('/process-payment', async (req, res) => {
    const { userId, packageId, paymentMethodId } = req.body;

    if (!userId || !packageId || !paymentMethodId) {
        return res.json({
            status: false,
            message: 'All fields are required'
        });
    }

    try {
        // 1️⃣ Find the package
        const [packageData] = await db.mySqlQury(
            'SELECT * FROM credit_packages WHERE id = ? AND status = ?',
            [packageId, 'active']
        );

        if (!packageData) {
            return res.json({
                status: false,
                message: 'Package not found or inactive'
            });
        }

        // 2️⃣ Find the user
        const [userData] = await db.mySqlQury(
            'SELECT * FROM users WHERE id = ?',
            [userId]
        );

        if (!userData) {
            return res.json({
                status: false,
                message: 'User not found'
            });
        }

        const amount = packageData.price;

        // 3️⃣ Create a charge
        const charge = await stripe.charges.create({
            amount: Math.round(amount * 100), // convert to cents
            currency: 'usd',
            source: paymentMethodId, // token/id from Stripe Elements
            description: `Purchase of ${packageData.name} by user ${userId}`
        });

        // 4️⃣ If payment succeeded, update user credits
        if (charge.status === 'succeeded') {
            const newCredits = (userData.credits || 0) + (packageData.credits || 0);

            await db.mySqlQury(
                'UPDATE users SET credits = ? WHERE id = ?',
                [newCredits, userId]
            );

            await db.mySqlQury(
                `INSERT INTO transaction_history 
                 (userId, amount, status, description, trxId, transaction_type) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    userId,
                    amount,
                    'succeeded',
                    `Purchase of ${packageData.name}  ${packageData.credits} credits`,
                    charge.id, // Stripe charge ID
                    'credit'
                ]
            );

            return res.json({
                status: true,
                message: 'Payment successful and credits updated',
                credits: newCredits
            });
        } else {
            return res.json({
                status: false,
                message: 'Payment failed'
            });
        }

    } catch (error) {
        console.error(error);
        return res.json({
            status: false,
            message: 'Server error',
            error: error.message
        });
    }
});




module.exports = router