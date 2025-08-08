require('dotenv').config();
const path = require("path");
const express = require('express');


const app= express();
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
app.use('/', userRoutes);
app.use('/twilio', twilioRoutes)
app.use('/', packageRoutes)
app.use('/stripe', stripeRoute)
app.use('/', dashboardRoute)

app.get("/",(req, res)=>{
    res.json('Hello second Number')
})




app.listen(process.env.PORT || 3000, () =>
  console.log('Server listening on port', process.env.PORT || 3000)
);