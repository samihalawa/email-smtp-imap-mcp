import nodemailer from 'nodemailer';

// Email configuration - Replace with your own SMTP settings
const EMAIL_CONFIG = {
  host: 'smtp.example.com',
  port: 587,
  secure: false,
  auth: {
    user: 'your-email@example.com',
    pass: 'your-email-password'
  }
};

// Example contact list - Replace with your own recipients
const CONTACTS = [
  'recipient1@example.com',
  'recipient2@example.com',
  'recipient3@example.com'
];

// Example email template
const EMAIL_TEMPLATE = {
  subject: 'Example Newsletter: AI Course Offering',
  html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; }
    h2 { color: #333366; }
    .section { margin-bottom: 20px; }
    .highlight { background-color: #f0f0f0; padding: 10px; border-radius: 5px; }
  </style>
</head>
<body>
  <h2>📌 AI Courses Now Available</h2>

  <div class='section'>
    <p>👋 Hello! We're excited to announce our new AI courses available for all skill levels.</p>
    
    <p>🧠 Beginner? No problem! We start from scratch with clear explanations and no unnecessary technical jargon.</p>
    
    <p>📈 Already have knowledge? We focus on advanced techniques, practical implementation, and specific tools.</p>
    
    <p>🚀 Want to apply AI in your business or professional sector? Learn how to use AI to optimize processes, automate tasks, and improve results.</p>
  </div>

  <div class='section'>
    <h3>📍 Areas we cover:</h3>
    
    <h4>💼 For professionals and businesses</h4>
    <ul>
      <li>Marketing and sales: Ad automation, trend analysis, AI content generation.</li>
      <li>Finance and data: Predictive models, risk analysis, portfolio optimization.</li>
      <li>Customer service and automation: Chatbot implementation, automated responses, intelligent CRM.</li>
      <li>Software development and AI products: How to integrate Machine Learning models into apps or services.</li>
      <li>Business and startups: AI strategies to automate tasks, improve conversions, and optimize operations.</li>
    </ul>
    
    <h4>🎨 For creatives and digital content</h4>
    <ul>
      <li>AI image and video generation: Popular generative models and tools.</li>
      <li>Content automation: AI for blogs, social networks, script generation, and copywriting.</li>
      <li>Music and audio: Creating sound effects and tracks with AI tools.</li>
    </ul>
    
    <h4>📊 For those who need AI without programming</h4>
    <ul>
      <li>No-code / Low-code AI: Learn to use AI platforms without writing code.</li>
      <li>Business tools: How to leverage AI in reports, data analysis, and process automation.</li>
    </ul>
    
    <h4>👨‍💻 For developers and technicians</h4>
    <ul>
      <li>Machine Learning and Deep Learning: Advanced models, training optimization.</li>
      <li>Python for AI: Popular frameworks and libraries.</li>
      <li>Generative AI applications: LLMs, vector databases, and agent frameworks.</li>
    </ul>
  </div>

  <div class='section'>
    <h3>📍 Format</h3>
    <p>✅ Online worldwide.</p>
    <p>✅ In-person options available in select locations.</p>
  </div>

  <div class='section highlight'>
    <h3>🎯 Our approach</h3>
    <ul>
      <li>✔️ Personalized classes: We focus on what you really need.</li>
      <li>✔️ Real use cases: Not just theory, we work with practical examples applicable to your area.</li>
      <li>✔️ Total flexibility: Adapted schedules and accessible prices.</li>
      <li>✔️ Support outside class: Resolution of doubts between sessions.</li>
      <li>✔️ Professional experience in AI: Not just teaching, we apply AI in real projects.</li>
    </ul>
  </div>

  <div class='section'>
    <h3>📲 Interested? Contact us at example@example.com for more information!</h3>
    <p>🚀 AI can be a tremendous advantage if you know how to use it well. Let's learn together!</p>
  </div>
</body>
</html>
`
};

async function sendEmails() {
  console.log(`Starting to send emails to ${CONTACTS.length} contacts...`);
  
  // Create transporter
  const transporter = nodemailer.createTransport(EMAIL_CONFIG);
  
  // Track success and failures
  const results = {
    success: [],
    failures: []
  };
  
  // Send emails with delay between each to avoid rate limits
  for (let i = 0; i < CONTACTS.length; i++) {
    const email = CONTACTS[i];
    
    try {
      console.log(`Sending email to ${email} (${i+1}/${CONTACTS.length})...`);
      
      // Create mail options
      const mailOptions = {
        from: `"AI Courses Team" <${EMAIL_CONFIG.auth.user}>`,
        to: email,
        subject: EMAIL_TEMPLATE.subject,
        html: EMAIL_TEMPLATE.html
      };
      
      // Send email
      const info = await transporter.sendMail(mailOptions);
      console.log(`Email sent to ${email}: ${info.response}`);
      results.success.push(email);
      
      // Add delay between sends to avoid rate limits (1 second)
      if (i < CONTACTS.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`Failed to send email to ${email}:`, error.message);
      results.failures.push({ email, error: error.message });
    }
  }
  
  // Print summary
  console.log('\n\n======= EMAIL SENDING COMPLETE =======');
  console.log(`Successfully sent: ${results.success.length}/${CONTACTS.length}`);
  if (results.failures.length > 0) {
    console.log(`Failed to send: ${results.failures.length}`);
    console.log('Failed recipients:');
    results.failures.forEach(failure => {
      console.log(`- ${failure.email}: ${failure.error}`);
    });
  }
}

// Execute the email sending function
sendEmails().catch(console.error);