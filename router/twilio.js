const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth')
const sendEmail = require('../mail/mailer')
const db = require('../database/db');
const twilio = require('twilio');
const { status } = require('express/lib/response');


const accountSId = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_AUTHTOKEN;


const client = twilio(accountSId, authToken);

function countryCodeToFlagEmoji(countryCode) {
    // Convert A-Z to regional indicator symbols
    return countryCode
        .toUpperCase()
        .replace(/./g, char => String.fromCodePoint(127397 + char.charCodeAt()));
}

router.get('/get-countries', async (req, res) => {
    try {
        const countries = await client.availablePhoneNumbers.list();

        const countriesWithCapabilities = await Promise.all(
            countries.map(async (c) => {
                let capabilities = [];
                try {
                    // Fetch a sample local number for this country
                    const phoneNumbers = await client
                        .availablePhoneNumbers(c.countryCode)
                        .local
                        .list({ limit: 1 });

                    if (phoneNumbers.length > 0 && phoneNumbers[0].capabilities) {
                        // Only keep the ones that are true
                        capabilities = Object.keys(phoneNumbers[0].capabilities)
                            .filter(cap => phoneNumbers[0].capabilities[cap]);
                        // e.g. ['sms', 'voice']
                    }
                } catch (err) {
                    console.log(`No local numbers for ${c.countryCode}: ${err.message}`);
                }

                return {
                    isoCode: c.countryCode,
                    name: c.country,
                    emoji: countryCodeToFlagEmoji(c.countryCode),
                    capabilities // direct array of capabilities
                };
            })
        );

        // Sort alphabetically
        countriesWithCapabilities.sort((a, b) => a.name.localeCompare(b.name));

        return res.json({
            status: true,
            message: 'Countries fetched successfully',
            countries: countriesWithCapabilities
        });

    } catch (error) {
        console.error(error);
        return res.json({
            status: false,
            message: "Server error"
        });
    }
});




router.get('/get-region/:countryCode', async (req, res) => {
    try {
        const { countryCode } = req.params;
        console.log(countryCode);

        const numbers = await client.availablePhoneNumbers(countryCode)
            .local
            .list();

        const regions = [...new Set(numbers.map(num => num.region).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b)); // Sort alphabetically

        return res.json({
            status: true,
            message: 'Regions fetched successfully',
            regions: regions || []
        });

    } catch (error) {
        console.log(error.message);
        return res.json({
            status: false,
            message: 'Server error'
        });
    }
});


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
            capabilities: n.capabilities
        }))

        return res.json({
            status: true,
            message: "Numbers Fetched Successfully",
            availableNumbers,
        })
    } catch (error) {
        console.log(error.message)
        return res.json({
            status: false,
            message: 'server error'
        })
    }
})


router.post('/create-chat', async (req, res) => {
    const { from_no, to_no } = req.body;

    if (!from_no || !to_no) {
        return res.json({
            status: false,
            message: 'from_no and to_no are required'
        });
    }

    try {

        const query = `
      INSERT INTO chats (from_no, to_no, status)
      VALUES (?, ?, ?)
    `;


        const result = await db.mySqlQury(query,
            [from_no, to_no, 'active'])

        res.json({
            statu: true,
            message: 'Chat created successfully',
            chatId: result.insertId
        });
    } catch (error) {
        console.log(error.message)
        return res.json({
            status: false,
            message: 'server error '
        })

    }
})


router.post('/send-message', async (req, res) => {
    const { to_no, from_no, body, chat_id } = req.body;

    if (!to_no || !from_no || !body || !chat_id) {
        return res.json({
            status: false,
            message: 'Missing required fields: to_no, from_no, body'
        });
    }

    try {

        // console.log(req.body)
        const message = await client.messages.create({
            body,
            from: from_no,
            to: to_no
        });

        const messageTime = new Date()
        await db.mySqlQury(
            'INSERT INTO messages (chat_id,to_no, from_no, body, messageSid, message_time, message_type) VALUES (?,?, ?, ?, ?, ?, ?)',
            [chat_id, to_no, from_no, body, message.sid, messageTime, 'outgoing']
        );


        return res.json({
            status: true,
            message: 'message sent',
            // message
        })

    } catch (error) {
        console.log(error.message);
        return res.json({
            status: false,
            message: "server error"
        })

    }
})


router.get('/get-all-chats/:number', async (req, res) => {
    const { number } = req.params;

    try {
        const incoming = await client.messages.list({ to: number, limit: 50 });
        const outgoing = await client.messages.list({ from: number, limit: 50 });

        const allMessages = [...incoming, ...outgoing].map(msg => {
            const isIncoming = msg.to === number;
            return {
                sid: msg.sid,
                from: msg.from,
                to: msg.to,
                body: msg.body,
                dateSent: msg.dateSent,
                direction: isIncoming ? 'incoming' : 'outgoing',
                contact: isIncoming ? msg.from : msg.to // conversation key
            };
        });

        // Group by contact
        const chats = {};
        allMessages.forEach(msg => {
            if (!chats[msg.contact]) chats[msg.contact] = [];
            chats[msg.contact].push(msg);
        });

        // Sort each conversation by date
        for (let contact in chats) {
            chats[contact].sort((a, b) => new Date(a.dateSent) - new Date(b.dateSent));
        }

        return res.json({
            status: true,
            chats
        });

    } catch (error) {
        console.error(error.message);
        return res.json({
            status: false,
            message: 'Failed to fetch chats'
        });
    }
});


router.get('/chats/:number', async (req, res) => {
    const { number } = req.params;

    try {

        const sql = `
            SELECT * 
            FROM chats 
            WHERE from_no = ? OR to_no = ?
        `;

        const chats = await db.mySqlQury(sql, [number, number]);

        return res.json({
            status: true,
            data: chats
        });
    } catch (error) {
        console.log(error.message)
        return res.json({
            status: false,
            message: 'server error'
        })

    }
})

// Get chat details and its messages
router.get('/chat/:chat_id', async (req, res) => {
    const { chat_id } = req.params;

    try {
        // Step 1: Find chat by ID
        const chatSql = `SELECT * FROM chats WHERE id = ? LIMIT 1`;
        const chatResult = await db.mySqlQury(chatSql, [chat_id]);

        if (chatResult.length === 0) {
            return res.json({
                status: false,
                message: 'Chat not found'
            });
        }

        // Step 2: Find messages for this chat
        const msgSql = `
            SELECT * 
            FROM messages 
            WHERE chat_id = ? 
            ORDER BY message_time ASC
        `;
        const messages = await db.mySqlQury(msgSql, [chat_id]);

        // Step 3: Return both
        return res.json({
            status: true,
            message: 'chat with messages fetched Successfully',
            chat: chatResult[0],
            messages: messages
        });

    } catch (error) {
        console.error(error.message);
        return res.json({
            status: false,
            message: 'Failed to fetch chat details'
        });
    }
});


router.post("/incoming-message", async (req, res) => {
    const { To, From, Body, MessageSid } = req.body;

    if (!To || !From || !Body || !MessageSid) {
        return res.json({
            status: false,
            message: "Missing required fields"
        });
    }

    try {

        const [existingChat] = await db.mySqlQury(
            `SELECT id FROM chats 
       WHERE (from_no = ? AND to_no = ?) OR (from_no = ? AND to_no = ?)
       LIMIT 1`,
            [From, To, To, From]
        );

        let chatId;
        if (!existingChat) {
            // Found existing chat
            chatId = existingChat.id;
        } else {
            // No chat found → create new chat
            const [chatResult] = await db.mySqlQury(
                `INSERT INTO chats (from_no, to_no, status ,created_at) VALUES (?, ?, active ,NOW())`,
                [From, To]
            );
            chatId = chatResult.insertId;

            const cleanBody = Body.replace(/'/g, "");

            await db.mySqlQury(
                `INSERT INTO messages (chat_id, ToNumber, FromNumber, Body, MessageSid, message_time)
       VALUES (?, ?, ?, ?, ?, NOW())`,
                [chatId, To, From, cleanBody, MessageSid]
            );
        }

        return res.json({
            success: true,
            message: "Message saved successfully", chat_id: chatId
        });
    } catch (error) {
        console.log(error.message)
        return res.json({
            status: false,
            message: 'server error '
        })
    }
})

router.get('/call-history/:id', async (req, res) => {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;      // Default: page 1
    const limit = parseInt(req.query.limit) || 10;   // Default: 10 records per page
    const offset = (page - 1) * limit;

    if (!id) {
        return res.json({
            status: false,
            message: 'id  is required'
        });
    }


    try {

        const [purchasedRows] = await db.mySqlQury(
            'SELECT number FROM purchased_no WHERE id = ?',
            [id]
        );

        if (!purchasedRows) {
            return res.json({
                status: false,
                message: 'Number not found for this ID'
            });
        }

        const number = purchasedRows.number;

        const countResult = await db.mySqlQury(
            `SELECT COUNT(*) AS total FROM call_history 
             WHERE \`from\` = ? OR \`to\` = ?`,
            [number, number]
        );

        const totalRecords = countResult.total;
        const totalPages = Math.ceil(totalRecords / limit);

        const [rows] = await db.mySqlQury(
            `SELECT * FROM call_history 
             WHERE \`from\` = ? OR \`to\` = ?
             ORDER BY start_time DESC
             LIMIT ? OFFSET ?`,
            [number, number, limit, offset]
        );

        res.json({
            status: true,
            message: 'history fatched successfully!',
            currentPage: page,
            totalPages: totalPages,
            totalRecords: totalRecords,
            recordsPerPage: limit,
            history: rows || []
        });
    } catch (error) {

        console.log(error.message)

        return res.json({
            status: false,
            message: 'server errror'
        })
    }
})


// router.get('/call-history/:id', async (req, res) => {
//     const { id } = req.params;
//     const page = parseInt(req.query.page) || 1;
//     const limit = parseInt(req.query.limit) || 10;
//     const offset = (page - 1) * limit;

//     const { direction } = req.query; // incoming | outgoing

//     if (!id) {
//         return res.json({
//             status: false,
//             message: 'id is required'
//         });
//     }

//     try {
//         const [purchasedRow] = await db.mySqlQury(
//             'SELECT number FROM purchased_no WHERE id = ?',
//             [id]
//         );

//         if (!purchasedRow) {
//             return res.json({
//                 status: false,
//                 message: 'Number not found for this ID'
//             });
//         }

//         const number = purchasedRow.number;

//         // Base condition
//         let whereClause = `(\`from\` = ? OR \`to\` = ?)`;
//         let params = [number, number];

//         // Direction filter
//         if (direction === 'incoming') {
//             whereClause += ' AND `to` = ?';
//             params.push(number);
//         } else if (direction === 'outgoing') {
//             whereClause += ' AND `from` = ?';
//             params.push(number);
//         }

//         // Total count
//         const [countResult] = await db.mySqlQury(
//             `SELECT COUNT(*) AS total FROM call_history WHERE ${whereClause}`,
//             params
//         );
//         const totalRecords = countResult.total || 0;
//         const totalPages = Math.ceil(totalRecords / limit);

//         // Paginated results
//         const history = await db.mySqlQury(
//             `SELECT * FROM call_history 
//              WHERE ${whereClause}
//              ORDER BY start_time DESC
//              LIMIT ? OFFSET ?`,
//             [...params, limit, offset]
//         );

//         res.json({
//             status: true,
//             message: 'History fetched successfully!',
//             currentPage: page,
//             totalPages,
//             totalRecords,
//             recordsPerPage: limit,
//             history: history || []
//         });
//     } catch (error) {
//         console.log(error.message);
//         return res.json({
//             status: false,
//             message: 'server error'
//         });
//     }
// });


router.post('/expir-user-packages', authenticateToken, async (req, res) => {
    const userId = req.user.id

    if (!userId) {
        return res.json({
            status: false,
            message: 'User ID is required'
        });
    }

    try {
        const today = new Date().toISOString().split('T')[0];

        const packages = await db.mySqlQury(
            `SELECT up.*, cp.validity_days
             FROM user_packages up
             JOIN packages cp ON up.package_id = cp.id
             WHERE up.user_id = ?
               AND DATE(up.end_date) = ?
               AND up.status = 'active'`,
            [userId, today]
        );

        if (packages.length === 0) {
            return res.json({
                status: true,
                message: 'No packages expiring today',
                updated: 0
            });
        }

        const result = await db.mySqlQury(
            `UPDATE user_packages 
             SET status = 'expired' 
             WHERE user_id = ? 
               AND DATE(end_date) = ? 
               AND status = 'active'`,
            [userId, today]
        );

        if (result.affectedRows > 0) {
            // 3️⃣ Only insert into expired_numbers if validity is 7 days
            for (const pkg of packages) {
                if (pkg.validity_days == 7) {
                    const next22Days = new Date();
                    next22Days.setDate(next22Days.getDate() + 22);

                    await db.mySqlQury(
                        `INSERT INTO expired_numbers (exp_numId, exp_released_date, status)
                         VALUES (?, ?,'active')`,
                        [
                            pkg.num_id, // assuming user_packages has number_id
                            next22Days.toISOString()
                        ]
                    );
                }
            }
        }
        return res.json({
            status: true,
            message: `${packages.length} package(s) marked as expired`,
            updated: packages.length
        });
    } catch (error) {

        console.log(error.message)
        return res.json({
            status: false,
            message: 'server error',
            error: error.message
        })

    }
})



router.get('/random-expired-number', authenticateToken, async (req, res) => {
    const userId = req.user.id;

    try {
        // Step 1: Get random expired number (your original query)
        const [rows] = await db.mySqlQury(
            `
            SELECT en.*
            FROM expired_numbers en
            WHERE en.status = 'active'
              AND en.id NOT IN (
                  SELECT exp_num_id 
                  FROM expired_number_users 
                  WHERE user_id = ?
              )
            ORDER BY RAND()
            LIMIT 1
            `,
            [userId]
        );

        if (!rows || rows.length === 0) {
            return res.json({
                status: false,
                message: 'No available expired number found'
            });
        }

        const expiredRecord = rows;

        // Step 2: Get the real number from purchased_no
        const [numberRow] = await db.mySqlQury(
            `SELECT number FROM purchased_no WHERE id = ? LIMIT 1`,
            [expiredRecord.exp_numId]
        );

        if (!numberRow || numberRow.length === 0) {
            return res.json({
                status: false,
                message: 'Real number not found for this expired ID'
            });
        }

        expiredRecord.exp_numId = numberRow.number;

        return res.json({
            status: true,
            message: 'Random expired number fetched successfully',
            data: expiredRecord
        });

    } catch (error) {
        console.error(error.message);
        return res.status(500).json({
            status: false,
            message: 'Server error',
            error: error.message
        });
    }
});







module.exports = router