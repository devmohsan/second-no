const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth')
const sendEmail = require('../mail/mailer')
const db = require('../database/db');
const twilio = require('twilio');


const accountSId = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_AUTHTOKEN;


const client = twilio(accountSId, authToken);

router.get('/get-countries', async (req, res) => {


    try {
        const numbers = await client.availablePhoneNumbers.list();

        const countries = numbers.map(c => ({
            isoCode: c.countryCode,
            name: c.country
        }));


        return res.json({
            status:true,
            message: 'countires fetched Succefully',
            countries,
        })

    } catch (error) {
        console.log(error.message)
        return res.json({
            status:false,
            message: "server error"
        })

    }
})

router.get('/get-region/:countryCode', async (req, res) => {
    try {
        const { countryCode } = req.params;
        console.log(countryCode)

        const numbers = await client.availablePhoneNumbers(countryCode)
            .local
            .list();

        const regions = [...new Set(numbers.map(num => num.region).filter(Boolean))];

        return res.json({
            status:true,
            message: 'region fetched Successfully',
            regions
        })

    } catch (error) {
        console.log(error.message)
        return res.json({
            status:false,
            message: 'server error '
        })

    }
})


router.get('/get-numbers/:countryCode/:region', async (req, res) => {
    try {
        const { countryCode, region } = req.params;
        const numbers = await client.availablePhoneNumbers(countryCode)
            .local
            .list({
                region: region
            });

        const availableNumbers = numbers.map(n => ({
            friendlyName: n.friendlyName,
            phoneNumber: n.phoneNumber,
            region: n.region,
            capabilities:n.capabilities
        }))

        return res.json({
            status:true,
            message: "Numbers Fetched Successfully",
            availableNumbers,
        })
    } catch (error) {
        console.log(error.message)
        return res.json({
            status:false,
            message: 'server error'
        })
    }
})




module.exports = router