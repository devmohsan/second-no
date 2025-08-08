const express = require('express');
const router = express.Router();
const db = require('../database/db');
const stripe = require('stripe')(process.env.STRIP_PRIVATE_KEY);



router.get('/', async (req, res) => {
    const { userId, packageId } = req.query;

    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;

    const [package] = await db.mySqlQury(
        'SELECT * FROM packages WHERE id=?',
        [packageId]
    )

    const amount = package.price
    const packageName = package.name

    res.render('stripe', {
        publishableKey,
        amount,
        userId,
        packageName,
        packageId
    });
});


router.post('/createCharges', async (req, res) => {
    const { userId, packageId, stripeToken, amount } = req.body

    console.log(req.body)

    if (!userId || !packageId || !stripeToken) {
        return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    try {
        const [package] = await db.mySqlQury(
            'SELECT * FROM packages WHERE id = ?',
            [packageId]
        )

        const remaining_minutes = package.minutes
        const remaining_texts = package.texts
        const remianing_credits = package.credits
        const validity = package.validity_days
        const start_date = new Date()

        let end_date = new Date(start_date)

        end_date.setDate(end_date.getDate() + validity)

        const status= 'active'

        console.log(package)
        const charge = await stripe.charges.create({
            amount: parseInt(amount) * 100,
            currency: 'usd',
            source: stripeToken,
            description: `Amount `
        });

        console.log(remaining_minutes)
        if(charge && charge.status === 'succeeded' ){
            await db.mySqlQury(
                'INSERT INTO user_packages (user_id, package_id, remaining_minutes, remaining_texts, remaining_credits, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [userId, packageId, remaining_minutes, remaining_texts, remianing_credits, start_date, end_date, status]
            )
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




module.exports = router