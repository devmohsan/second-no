const nodemailer = require('nodemailer');
require('dotenv').config();
const handlebars = require('handlebars');


const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
})


const sendEmail = async (to, subject, htmlTemplate, replacements) => {
    try {
        const template = handlebars.compile(htmlTemplate);
        const htmlToSend = template(replacements);

       await transport.sendMail({
            from: 'Second Number <fbasesoftarena83@gmail.com>',
            to: to,
            subject: subject,
            html: htmlToSend
        })


        return true

    } catch (error) {

        console.log('error while sending email', error.message)
        return false

    }

}


module.exports= sendEmail
