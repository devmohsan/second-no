require('dotenv').config();
const path = require("path");
const express = require('express');
const cookieParser = require("cookie-parser"); 
const session = require('express-session');


const app= express();
app.use(
    session({
        secret: 'techie members', // use env variable in real projects
        resave: false,
        saveUninitialized: true,
        cookie: { secure: false }, // set secure: true in HTTPS environments
    })
);

app.use(cookieParser());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));

const userRoutes = require('./router/user');
const twilioRoutes= require('./router/twilio')
const packageRoutes=require('./router/package')
const stripeRoute= require('./router/stripe')
const dashboardRoute=require('./router/dashbaord')
const rewardRoutes= require('./router/reward')
const adminloginRoutes= require('./router/admin/login')
const adminDashboardRoutes= require('./router/admin/dashboard')
const adminUsersRoutes= require('./router/admin/user')
const adminNumbersRoutes= require('./router/admin/numbers')
const adminSettingsRoutes= require('./router/admin/settings')
const adminRewardRoutes= require('./router/admin/rewards')
const adminCoinOfferRoutes= require('./router/admin/coin_offers')
const adminCreditPackagesRoutes= require('./router/admin/credit_packages')
const adminPackagesRoutes= require('./router/admin/packages')

app.use('/', adminloginRoutes);
app.use('/admin', adminDashboardRoutes)
app.use('/admin', adminUsersRoutes)
app.use('/admin', adminNumbersRoutes)
app.use('/admin', adminSettingsRoutes)
app.use('/admin', adminRewardRoutes)
app.use('/admin', adminCoinOfferRoutes)
app.use('/admin', adminCreditPackagesRoutes)
app.use('/admin', adminPackagesRoutes)


// API routes
app.use('/', userRoutes);
app.use('/twilio', twilioRoutes)
app.use('/', packageRoutes)
app.use('/stripe', stripeRoute)
app.use('/', dashboardRoute)
app.use('/rewards', rewardRoutes)

// app.get("/",(req, res)=>{
//     res.json('Hello second Number')
// })




app.listen(process.env.PORT || 3000, () =>
  console.log('Server listening on port', process.env.PORT || 3000)
);