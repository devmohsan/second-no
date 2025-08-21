const jwt = require('jsonwebtoken');
const secretKey = process.env.JWT_SECRET;

const auth = (req, res, next) => {
    const token = req.cookies?.token;

    if (!token) {
        return res.redirect('/');
    }

    try {
        const decoded = jwt.verify(token, secretKey); // 🔄 Removed 'await'
        req.user = decoded;
        res.locals.admin= decoded;
        next();
    } catch (err) {
        console.error('Invalid token:', err.message);
        res.clearCookie('token');
        return res.redirect('/');
    }
};

module.exports = auth;