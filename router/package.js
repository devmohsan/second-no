const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth')
const db = require('../database/db');



router.get('/get-active_packages', async (req, res) => {

    try {
        const packages = await db.mySqlQury(
            'SELECT * FROM packages WHERE status = ?',
            ['active'] // parameters should be in an array
        );
        if (packages.length === 0) {
            return res.json({
                status:false,
                message: "packages not found"
            })
        }

        return res.json({
            status:true,
            message: "package fetched Successfully",
            packages
        })
    } catch (error) {
        console.log(error.message)
        return res.json({
            status:false,
            message: 'server error'
        })
    }
})

router.get('/package/:id', async (req, res) => {
    const packageId = req.params;

    if (!packageId) {
        return res.status(500).json({ error: 'Package ID is required' });
    }
    try {

        const [rows] = await db.mySqlQury(
            'SELECT * FROM packages WHERE id = ? AND status = ?',
            [packageId, 'active']
        );

        if (rows.length === 0) {
            return res.json({ 
                status:false,
                message: 'Package not found or inactive' });
        }

        return res.json({
            status:true,
            message: 'Package Fetched Successfully',
            rows
        })

    } catch (error) {
        console.log(error.message)
        return res.json({
            status:false,
            message: 'server Error'
        })

    }
})


module.exports = router