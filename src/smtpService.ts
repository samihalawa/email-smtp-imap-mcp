/**
 * SMTP email sending operations
 */

import nodemailer from 'nodemailer';
import { EmailAccount, EmailAttachment } from './types.js';
import { getEmailById } from './imapService.js';

/**
 * Create SMTP transporter
 */
function createTransporter(account: EmailAccount) {
  return nodemailer.createTransport({
    host: account.smtp_host,
    port: account.smtp_port,
    secure: account.smtp_secure,
    auth: {
      user: account.smtp_user,
      pass: account.smtp_pass
    }
  });
}

/**
 * Send a new email
 */
export async function sendEmail(
  account: EmailAccount,
  options: {
    to: string[];
    subject: string;
    body: string;
    bodyType?: 'plain' | 'html';
    cc?: string[];
    bcc?: string[];
    attachments?: EmailAttachment[];
    fromName?: string;
  }
): Promise<{ messageId: string; success: boolean }> {
  const transporter = createTransporter(account);

  const mailOptions: any = {
    from: options.fromName 
      ? `"${options.fromName}" <${account.smtp_user}>`
      : account.smtp_user,
    to: options.to.join(', '),
    subject: options.subject
  };

  // Set body based on type
  if (options.bodyType === 'plain') {
    mailOptions.text = options.body;
  } else {
    mailOptions.html = options.body;
  }

  // Add CC and BCC if provided
  if (options.cc && options.cc.length > 0) {
    mailOptions.cc = options.cc.join(', ');
  }
  if (options.bcc && options.bcc.length > 0) {
    mailOptions.bcc = options.bcc.join(', ');
  }

  // Add attachments if provided
  if (options.attachments && options.attachments.length > 0) {
    mailOptions.attachments = options.attachments.map(att => ({
      filename: att.filename,
      content: Buffer.from(att.content, 'base64'),
      contentType: att.content_type
    }));
  }

  const info = await transporter.sendMail(mailOptions);

  return {
    messageId: info.messageId,
    success: !!info.messageId
  };
}

/**
 * Reply to an email
 */
export async function replyToEmail(
  account: EmailAccount,
  emailId: string,
  options: {
    body: string;
    bodyType?: 'plain' | 'html';
    replyAll?: boolean;
    includeOriginal?: boolean;
    includeAttachments?: boolean;
    additionalAttachments?: EmailAttachment[];
  }
): Promise<{ messageId: string; success: boolean }> {
  // Get the original email
  const originalEmail = await getEmailById(account, emailId, options.includeAttachments);
  
  if (!originalEmail) {
    throw new Error(`Email with ID ${emailId} not found`);
  }

  // Extract recipient email from "Name <email>" format
  const extractEmail = (str: string): string => {
    const match = str.match(/<(.+?)>/);
    return match ? match[1] : str.trim();
  };

  // Determine recipients
  const to: string[] = [extractEmail(originalEmail.from)];
  
  if (options.replyAll && originalEmail.to) {
    originalEmail.to.forEach(addr => {
      const email = extractEmail(addr);
      if (email !== account.smtp_user && !to.includes(email)) {
        to.push(email);
      }
    });
  }

  // Build reply body
  let replyBody = options.body;
  
  if (options.includeOriginal && originalEmail.body) {
    const originalText = options.bodyType === 'html'
      ? `<br><br>---<br><strong>Original Message:</strong><br>${originalEmail.body}`
      : `\n\n---\nOriginal Message:\n${originalEmail.body}`;
    
    replyBody += originalText;
  }

  // Prepare attachments
  const attachments = options.additionalAttachments || [];
  if (options.includeAttachments && originalEmail.attachments) {
    attachments.push(...originalEmail.attachments);
  }

  // Send the reply
  return sendEmail(account, {
    to,
    subject: originalEmail.subject.startsWith('Re:') 
      ? originalEmail.subject 
      : `Re: ${originalEmail.subject}`,
    body: replyBody,
    bodyType: options.bodyType,
    attachments,
    fromName: account.default_from_name
  });
}

/**
 * Forward an email
 */
export async function forwardEmail(
  account: EmailAccount,
  emailId: string,
  options: {
    to: string[];
    body?: string;
    bodyType?: 'plain' | 'html';
    includeOriginal?: boolean;
    includeAttachments?: boolean;
    additionalAttachments?: EmailAttachment[];
  }
): Promise<{ messageId: string; success: boolean }> {
  // Get the original email
  const originalEmail = await getEmailById(account, emailId, options.includeAttachments);
  
  if (!originalEmail) {
    throw new Error(`Email with ID ${emailId} not found`);
  }

  // Build forward body
  let forwardBody = options.body || '';
  
  if (options.includeOriginal && originalEmail.body) {
    const originalText = options.bodyType === 'html'
      ? `<br><br>---<br><strong>Forwarded Message:</strong><br>${originalEmail.body}`
      : `\n\n---\nForwarded Message:\n${originalEmail.body}`;
    
    forwardBody += originalText;
  }

  // Prepare attachments
  const attachments = options.additionalAttachments || [];
  if (options.includeAttachments && originalEmail.attachments) {
    attachments.push(...originalEmail.attachments);
  }

  // Send the forward
  return sendEmail(account, {
    to: options.to,
    subject: originalEmail.subject.startsWith('Fwd:') 
      ? originalEmail.subject 
      : `Fwd: ${originalEmail.subject}`,
    body: forwardBody,
    bodyType: options.bodyType,
    attachments,
    fromName: account.default_from_name
  });
}
