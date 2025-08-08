const mysql = require("mysql2");

let connection = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'second_number',
    connectionLimit: 100,
    charset: 'utf8mb4'
});

// Connection test (optional but useful for debugging)
connection.getConnection((err, conn) => {
    if (err) {
        console.error("MySQL connection failed:", err.message);
    } else {
        console.log("MySQL connected successfully.");
        conn.release();
    }
});

const mySqlQury = (qry, params = []) => {
    return new Promise((resolve, reject) => {
        connection.query(qry, params, (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
};

module.exports = { connection, mySqlQury };
