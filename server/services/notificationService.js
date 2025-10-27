const nodemailer = require('nodemailer');

class NotificationService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  initializeTransporter() {
    // For development, we'll use a test account
    // In production, you would use real SMTP credentials
    this.transporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST || 'smtp.ethereal.email',
      port: process.env.SMTP_PORT || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER || 'ethereal.user@ethereal.email',
        pass: process.env.SMTP_PASS || 'ethereal.pass'
      }
    });

    // Verify connection configuration
    this.transporter.verify((error, success) => {
      if (error) {
        console.log('SMTP configuration error:', error);
      } else {
        console.log('✅ Email service is ready to send messages');
      }
    });
  }

  async sendEmailNotification(to, subject, html, text) {
    try {
      if (!this.transporter) {
        console.warn('Email transporter not initialized');
        return false;
      }

      const mailOptions = {
        from: process.env.FROM_EMAIL || 'noreply@scholarshipapp.com',
        to: to,
        subject: subject,
        html: html,
        text: text
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('✅ Email sent:', info.messageId);
      return true;
    } catch (error) {
      console.error('❌ Error sending email:', error);
      return false;
    }
  }

  async sendApplicationStatusNotification(student, application, newStatus, reviewerNotes = '') {
    const statusMessages = {
      'submitted': 'Your application has been submitted successfully',
      'under_review': 'Your application is now under review',
      'shortlisted': 'Congratulations! Your application has been shortlisted',
      'approved': 'Congratulations! Your application has been approved',
      'rejected': 'Your application has been rejected'
    };

    const statusColors = {
      'submitted': '#3B82F6',
      'under_review': '#8B5CF6',
      'shortlisted': '#6366F1',
      'approved': '#10B981',
      'rejected': '#EF4444'
    };

    const subject = `Application ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)} - ${application.scholarship.name}`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Application Status Update</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: ${statusColors[newStatus]}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }
          .status-badge { 
            display: inline-block; 
            padding: 8px 16px; 
            background: ${statusColors[newStatus]}; 
            color: white; 
            border-radius: 20px; 
            font-weight: bold; 
            text-transform: uppercase; 
            font-size: 12px;
          }
          .scholarship-info { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
          .button { 
            display: inline-block; 
            padding: 12px 24px; 
            background: ${statusColors[newStatus]}; 
            color: white; 
            text-decoration: none; 
            border-radius: 6px; 
            font-weight: bold;
            margin: 20px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎓 Scholarship Application Update</h1>
          </div>
          <div class="content">
            <p>Dear ${student.firstName} ${student.lastName},</p>
            
            <p>We hope this email finds you well. We wanted to update you on the status of your scholarship application.</p>
            
            <div class="scholarship-info">
              <h3>Application Details</h3>
              <p><strong>Scholarship:</strong> ${application.scholarship.name}</p>
              <p><strong>Amount:</strong> ₹${application.scholarship.amount.toLocaleString()}</p>
              <p><strong>Status:</strong> <span class="status-badge">${newStatus.replace('_', ' ')}</span></p>
              <p><strong>Applied Date:</strong> ${new Date(application.submittedAt).toLocaleDateString()}</p>
            </div>
            
            <h3>Update Message</h3>
            <p>${statusMessages[newStatus]}</p>
            
            ${reviewerNotes ? `
              <div style="background: #e3f2fd; padding: 15px; border-left: 4px solid #2196f3; margin: 20px 0;">
                <h4>Reviewer Notes:</h4>
                <p>${reviewerNotes}</p>
              </div>
            ` : ''}
            
            ${newStatus === 'approved' ? `
              <div style="background: #e8f5e8; padding: 15px; border-left: 4px solid #4caf50; margin: 20px 0;">
                <h4>🎉 Congratulations!</h4>
                <p>Your scholarship has been approved! You will receive further instructions regarding the disbursement process.</p>
              </div>
            ` : ''}
            
            ${newStatus === 'rejected' ? `
              <div style="background: #ffebee; padding: 15px; border-left: 4px solid #f44336; margin: 20px 0;">
                <h4>We appreciate your application</h4>
                <p>While your application wasn't successful this time, we encourage you to apply for other scholarships that match your profile.</p>
              </div>
            ` : ''}
            
            <p>If you have any questions about your application or need further assistance, please don't hesitate to contact our support team.</p>
            
            <p>Thank you for choosing our scholarship platform.</p>
            
            <div class="footer">
              <p>Best regards,<br>The Scholarship Team</p>
              <p>This is an automated message. Please do not reply to this email.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Dear ${student.firstName} ${student.lastName},
      
      We wanted to update you on the status of your scholarship application.
      
      Scholarship: ${application.scholarship.name}
      Amount: ₹${application.scholarship.amount.toLocaleString()}
      Status: ${newStatus.replace('_', ' ')}
      Applied Date: ${new Date(application.submittedAt).toLocaleDateString()}
      
      ${statusMessages[newStatus]}
      
      ${reviewerNotes ? `Reviewer Notes: ${reviewerNotes}` : ''}
      
      If you have any questions, please contact our support team.
      
      Best regards,
      The Scholarship Team
    `;

    return await this.sendEmailNotification(student.email, subject, html, text);
  }

  async sendWelcomeEmail(student) {
    const subject = 'Welcome to Scholarship Platform - Complete Your Profile';
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #3B82F6; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { 
            display: inline-block; 
            padding: 12px 24px; 
            background: #3B82F6; 
            color: white; 
            text-decoration: none; 
            border-radius: 6px; 
            font-weight: bold;
            margin: 20px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎓 Welcome to Scholarship Platform!</h1>
          </div>
          <div class="content">
            <p>Dear ${student.firstName},</p>
            
            <p>Welcome to our scholarship platform! We're excited to have you join our community of students pursuing their educational goals.</p>
            
            <h3>Next Steps:</h3>
            <ol>
              <li>Complete your student profile with your academic and personal information</li>
              <li>Browse available scholarships that match your criteria</li>
              <li>Apply for scholarships that interest you</li>
              <li>Track your application status in your dashboard</li>
            </ol>
            
            <p>To get started, please complete your profile by clicking the button below:</p>
            
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard" class="button">
              Complete Your Profile
            </a>
            
            <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
            
            <p>Best regards,<br>The Scholarship Team</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Dear ${student.firstName},
      
      Welcome to our scholarship platform! We're excited to have you join our community.
      
      Next Steps:
      1. Complete your student profile
      2. Browse available scholarships
      3. Apply for scholarships
      4. Track your applications
      
      Visit: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard
      
      Best regards,
      The Scholarship Team
    `;

    return await this.sendEmailNotification(student.email, subject, html, text);
  }

  async sendDeadlineReminder(student, scholarship) {
    const daysLeft = Math.ceil((new Date(scholarship.deadline) - new Date()) / (1000 * 60 * 60 * 24));
    
    const subject = `⏰ Deadline Reminder: ${scholarship.name} - ${daysLeft} days left`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Deadline Reminder</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #F59E0B; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { 
            display: inline-block; 
            padding: 12px 24px; 
            background: #F59E0B; 
            color: white; 
            text-decoration: none; 
            border-radius: 6px; 
            font-weight: bold;
            margin: 20px 0;
          }
          .warning { background: #fef3cd; padding: 15px; border-left: 4px solid #F59E0B; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⏰ Scholarship Deadline Reminder</h1>
          </div>
          <div class="content">
            <p>Dear ${student.firstName},</p>
            
            <div class="warning">
              <h3>⏰ Don't Miss Out!</h3>
              <p>The deadline for <strong>${scholarship.name}</strong> is approaching fast!</p>
            </div>
            
            <h3>Scholarship Details:</h3>
            <ul>
              <li><strong>Name:</strong> ${scholarship.name}</li>
              <li><strong>Amount:</strong> ₹${scholarship.amount.toLocaleString()}</li>
              <li><strong>Deadline:</strong> ${new Date(scholarship.deadline).toLocaleDateString()}</li>
              <li><strong>Days Remaining:</strong> ${daysLeft} day${daysLeft !== 1 ? 's' : ''}</li>
            </ul>
            
            <p>${daysLeft <= 3 ? '⚠️ Hurry! Only a few days left to apply!' : 'Make sure to submit your application before the deadline.'}</p>
            
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard" class="button">
              Apply Now
            </a>
            
            <p>Don't miss this opportunity to secure funding for your education!</p>
            
            <p>Best regards,<br>The Scholarship Team</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Dear ${student.firstName},
      
      Don't miss out! The deadline for ${scholarship.name} is approaching.
      
      Scholarship: ${scholarship.name}
      Amount: ₹${scholarship.amount.toLocaleString()}
      Deadline: ${new Date(scholarship.deadline).toLocaleDateString()}
      Days Remaining: ${daysLeft}
      
      Apply now: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard
      
      Best regards,
      The Scholarship Team
    `;

    return await this.sendEmailNotification(student.email, subject, html, text);
  }
}

module.exports = new NotificationService();
