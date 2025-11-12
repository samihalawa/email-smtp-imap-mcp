
import nodemailer from 'nodemailer';

// IMPORTANT: Configure these values with your own SMTP credentials
const transporter = nodemailer.createTransport({
  host: 'smtp.example.com',
  port: 587,
  secure: false,
  auth: {
    user: 'your-email@example.com',
    pass: 'your-email-password'
  }
});

const mailOptions = {
  from: 'your-email@example.com',
  to: 'recipient@example.com',
  subject: 'Test Email',
  html: '<h1>Test Email</h1><p>This is a test email from the SMTP server.</p>'
};

transporter.sendMail(mailOptions).then(info => {
  console.log('Email sent successfully:', info.response);
}).catch(error => {
  console.error('Error sending email:', error);
});
