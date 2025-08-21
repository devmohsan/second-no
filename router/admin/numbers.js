const express = require('express');
const router = express.Router();
const auth = require('../../middleware/adminAuth');

const db = require('../../database/db');
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTHTOKEN);




function countryCodeToFlagEmoji(countryCode) {
  // Convert A-Z to regional indicator symbols
  return countryCode
    .toUpperCase()
    .replace(/./g, char => String.fromCodePoint(127397 + char.charCodeAt()));
}


// router.get('/numbers', auth, async (req, res) => {
//     try {
//         const search = req.query.search || '';
//         const sourceType = req.query.source_type || '';

//         let sql = `
//             SELECT up.id AS package_id,
//                    up.source_type,
//                    up.status,
//                    up.start_date,
//                    up.end_date,
//                    pn.id AS number_id,
//                    pn.number,
//                    pn.c_name,
//                    pn.r_name,
//                    u.id AS user_id,
//                    u.name AS user_name,
//                    u.email AS user_email
//             FROM user_packages up
//             INNER JOIN purchased_no pn ON up.num_id = pn.id
//             INNER JOIN users u ON up.user_id = u.id
//             WHERE u.deleted_at IS NULL
//         `;
//         let params = [];

//         // filter: search (on name, email, number)
//         if (search) {
//             sql += ` AND (u.name LIKE ? OR u.email LIKE ? OR pn.number LIKE ?)`;
//             params.push(`%${search}%`, `%${search}%`, `%${search}%`);
//         }

//         // filter: source_type
//         if (sourceType) {
//             sql += ` AND up.source_type = ?`;
//             params.push(sourceType);
//         }

//         sql += ` ORDER BY up.created_at DESC`;

//         const dbNumbers = await db.mySqlQury(sql, params);

//         // add flag field
//         const numbers = dbNumbers.map(num => ({
//             ...num,
//             flag: countryCodeToFlagEmoji(num.c_name)
//         }));

//         res.render('numbers', {
//             numbers,
//             query: req.query, // search + filter preserve karne ke liye
//         });

//     } catch (err) {
//         console.error('Error in numbers route:', err);
//         res.redirect('/dashboard');
//     }
// });


router.get('/numbers', auth, async (req, res) => {
  try {
    const search = req.query.search || '';
    const sourceType = req.query.source_type || '';
    const numberType = req.query.numberType || ''; // 👈 new query param

    let sql = '';
    let params = [];

    if (numberType === 'expired') {
      // 🔴 Expired numbers query
      sql = `
        SELECT en.id AS expired_id,
               en.created_at,
               pn.id AS number_id,
               pn.number,
               pn.c_name,
               pn.r_name,
               pn.status
        FROM expired_numbers en
        INNER JOIN purchased_no pn ON en.exp_numId = pn.id
      `;

      //        u.name AS user_name,
      //  u.email AS user_email
      //  u.id AS user_id,
      // INNER JOIN users u ON en.user_id = u.id

      // filter: search (on name, email, number)
      if (search) {
        sql += ` AND (u.name LIKE ? OR u.email LIKE ? OR pn.number LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      sql += ` ORDER BY en.created_at DESC`;

    } else {
      // 🟢 Active numbers query (old logic)
      sql = `
        SELECT up.id AS package_id,
               up.source_type,
               up.status,
               up.start_date,
               up.end_date,
               pn.id AS number_id,
               pn.number,
               pn.c_name,
               pn.r_name,
               u.id AS user_id,
               u.name AS user_name,
               u.email AS user_email
        FROM user_packages up
        INNER JOIN purchased_no pn ON up.num_id = pn.id
        INNER JOIN users u ON up.user_id = u.id
        WHERE u.deleted_at IS NULL
      `;

      if (search) {
        sql += ` AND (u.name LIKE ? OR u.email LIKE ? OR pn.number LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      if (sourceType) {
        sql += ` AND up.source_type = ?`;
        params.push(sourceType);
      }

      sql += ` ORDER BY up.created_at DESC`;
    }

    const dbNumbers = await db.mySqlQury(sql, params);

    // add flag
    const numbers = dbNumbers.map(num => ({
      ...num,
      flag: countryCodeToFlagEmoji(num.c_name)
    }));

    // return res.json({
    //     numbers,
    //     query: req.query
    // })

    res.render('numbers', {
      numbers,
      query: req.query, // search + filter preserve
    });

  } catch (err) {
    console.error('Error in numbers route:', err);
    res.redirect('/admin/dashboard');
  }
});



router.post('/numbers/reverse/:id', auth, async (req, res) => {
  try {
    const numId = req.params.id;


    await db.mySqlQury("UPDATE user_packages SET status='cancelled' WHERE id = ?", [numId]);

    res.json({ message: `Number cancelled successfully` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error releasing number" });
  }
});

router.post('/numbers/re-assign/:id', auth, async (req, res) => {
  try {
    const numId = req.params.id;

    // Example: mark status as reassigned
    await db.mySqlQury("UPDATE user_packages SET status='active' WHERE id = ?", [numId]);

    res.json({ message: `Number  reassigned successfully` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error reassigning number" });
  }
});


router.post('/numbers/release-no/:id', auth, async (req, res) => {
  try {
    const packageId = req.params.id;
    const numbrType = req.query.numbrType;   // ✅ keep consistent with frontend
    console.log("Received numbrType:", numbrType);

    let purchasedNo;
    if (numbrType == 'expired') {

      const [expiredNumber] = await db.mySqlQury('SELECT * FROM expired_numbers WHERE exp_numId=?',
        [packageId]
      )

      if (!expiredNumber) {
        return res.status(404).json({ message: " Expired Number not found" });
      }

      [purchasedNo] = await db.mySqlQury("SELECT * FROM purchased_no WHERE id = ?", [expiredNumber.exp_numId]);

      if (!purchasedNo) {
        return res.status(404).json({ message: "Purchased number not found" });
      }

      if (!purchasedNo.sid) {
        return res.status(400).json({ message: "Number does not have a valid Twilio SID" });
      }

      // Step 3: Release number from Twilio
      // await client.incomingPhoneNumbers(purchasedNo.sid).remove();

      await db.mySqlQury("UPDATE user_packages SET status = 'inactive' WHERE num_id = ?", [packageId]);
      await db.mySqlQury("UPDATE purchased_no SET status = 'released' WHERE id = ?", [purchasedNo.id]);

    } else {
      // Step 1: Find user_package by id
      const [userPackage] = await db.mySqlQury("SELECT * FROM user_packages WHERE id = ?", [packageId]);

      if (!userPackage) {
        return res.status(404).json({ message: "User package not found" });
      }

      // Step 2: Get the purchased number
      [purchasedNo] = await db.mySqlQury("SELECT * FROM purchased_no WHERE id = ?", [userPackage.num_id]);

      if (!purchasedNo) {
        return res.status(404).json({ message: "Purchased number not found" });
      }

      if (!purchasedNo.sid) {
        return res.status(400).json({ message: "Number does not have a valid Twilio SID" });
      }

      // Step 3: Release number from Twilio
      // await client.incomingPhoneNumbers(purchasedNo.sid).remove();

      // Step 4: Update statuses in DB
      await db.mySqlQury("UPDATE user_packages SET status = 'inactive' WHERE id = ?", [packageId]);
      await db.mySqlQury("UPDATE purchased_no SET status = 'released' WHERE id = ?", [purchasedNo.id]);

    }


    res.json({ message: `Number ${purchasedNo.number} released successfully` });

  } catch (err) {
    console.error("Error releasing number:", err);
    res.status(500).json({ message: "Error releasing number", error: err.message });
  }
});


router.get('/numbers/view/:id', auth, async (req, res) => {
  try {
    const numberId = req.params.id;
    const numbrType = req.query.numbrType; // "assigned" or "expired"

    console.log("Viewing number:", numberId, "Type:", numbrType);

    let purchasedNo;
    let purchasedBy = [];
    let rewardedTo = [];

    if (numbrType === "expired") {
      // Step 1: find expired record
      const [expiredNumber] = await db.mySqlQury(
        "SELECT * FROM expired_numbers WHERE exp_numId = ?",
        [numberId]
      );

      if (!expiredNumber) {
        return res.redirect('/admin/numbers?numberType=expired');
      }

      // Step 2: get purchased_no details
      [purchasedNo] = await db.mySqlQury(
        "SELECT * FROM purchased_no WHERE id = ?",
        [expiredNumber.exp_numId]
      );

      if (!purchasedNo) {
        return res.redirect('/admin/numbers?numberType=expired');
      }

      // Step 3: split packages by source_type
      // purchasedBy = await db.mySqlQury(
      //   `SELECT up.*, u.name AS user_name, u.email AS user_email 
      //    FROM user_packages up
      //    JOIN users u ON up.user_id = u.id
      //    WHERE up.num_id = ? AND up.source_type = 'stripe'`,
      //   [purchasedNo.id]
      // );

      purchasedBy = await db.mySqlQury(
        `SELECT up.*, 
          u.name AS user_name, 
          u.email AS user_email,
          th.id AS transaction_id,
          th.amount AS transaction_amount,
          th.trxId AS trxid,
          th.status AS transaction_status,
          th.created_at AS transaction_date
   FROM user_packages up
   JOIN users u 
     ON up.user_id = u.id
   LEFT JOIN transaction_history th
     ON th.userId = up.user_id 
    AND th.numbrId = up.num_id
   WHERE up.num_id = ? 
     AND up.source_type = 'stripe'`,
        [purchasedNo.id]
      );

      rewardedTo = await db.mySqlQury(
        `SELECT up.*, u.name AS user_name, u.email AS user_email 
         FROM user_packages up
         JOIN users u ON up.user_id = u.id
         WHERE up.num_id = ? AND up.source_type = 'coin_offer'`,
        [purchasedNo.id]
      );

    } else if (numbrType === "assigned") {
      // Step 1: directly find user package
      const [userPackage] = await db.mySqlQury(
        "SELECT * FROM user_packages WHERE id = ?",
        [numberId]
      );

      if (!userPackage) {
        return res.redirect('/admin/numbers?numberType=assigned');
      }

      // Step 2: get purchased_no
      [purchasedNo] = await db.mySqlQury(
        "SELECT * FROM purchased_no WHERE id = ?",
        [userPackage.num_id]
      );

      if (!purchasedNo) {
        return res.redirect('/admin/numbers?numberType=assigned');
      }

      // Step 3: split packages by source_type
      // purchasedBy = await db.mySqlQury(
      //   `SELECT up.*, u.name AS user_name, u.email AS user_email 
      //    FROM user_packages up
      //    JOIN users u ON up.user_id = u.id
      //    WHERE up.num_id = ? AND up.source_type = 'stripe'`,
      //   [purchasedNo.id]
      // );

      purchasedBy = await db.mySqlQury(
        `SELECT up.*, 
          u.name AS user_name, 
          u.email AS user_email,
          th.id AS transaction_id,
          th.amount AS transaction_amount,
          th.trxId AS trxid,
          th.status AS transaction_status,
          th.created_at AS transaction_date
   FROM user_packages up
   JOIN users u 
     ON up.user_id = u.id
   LEFT JOIN transaction_history th
     ON th.userId = up.user_id 
    AND th.numbrId = up.num_id
   WHERE up.num_id = ? 
     AND up.source_type = 'stripe'`,
        [purchasedNo.id]
      );
      rewardedTo = await db.mySqlQury(
        `SELECT up.*, u.name AS user_name, u.email AS user_email 
         FROM user_packages up
         JOIN users u ON up.user_id = u.id
         WHERE up.num_id = ? AND up.source_type = 'coin_offer'`,
        [purchasedNo.id]
      );
    } else {
      return res.redirect('/admin/numbers?numberType=assigned');
    }

    // return res.json({
    //         purchasedNo,
    //   purchasedBy,
    //   rewardedTo
    // })

    return res.render('numberView', {
      purchasedNo,
      purchasedBy,
      rewardedTo
    })

  } catch (err) {
    console.error("Error viewing number:", err.message);
    // return res.redirect('/admin/numbers');;
    return res.json({
      message: err.message
    })
  }
});






module.exports = router