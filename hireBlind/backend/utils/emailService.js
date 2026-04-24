const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'krishnawadhwa2@gmail.com',
    pass: 'lsvb fafd buex fnav',
  },
});

/**
 * Send an email to the recruiter with the session ID.
 * @param {string} toEmail 
 * @param {string} jobTitle 
 * @param {string} sessionId 
 */
const sendSessionEmail = async (toEmail, jobTitle, sessionId) => {
  if (!toEmail) return;
  
  const mailOptions = {
    from: '"HireBlind Admin" <krishnawadhwa2@gmail.com>',
    to: toEmail,
    subject: `New Screening Session: ${jobTitle}`,
    html: `
      <h2>New Resume Screening Session Available</h2>
      <p>A new screening session has been set up for the <strong>${jobTitle}</strong> position.</p>
      <p><strong>Session ID:</strong> <code>${sessionId}</code></p>
      <p>You can load this session in your Recruiter Dashboard to view candidates, compliance reports, and audit logs.</p>
      <br>
      <p>Best regards,<br>The HireBlind System</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Email successfully sent to ${toEmail}`);
  } catch (error) {
    console.error('Error sending email:', error);
  }
};

module.exports = {
  sendSessionEmail,
};
