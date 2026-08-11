/**
 * SMTP email sending operations
 */

import nodemailer from 'nodemailer';
import { EmailAccount, EmailAttachment, EmailMessage } from './types.js';
import { getEmailById } from './imapService.js';

/**
 * Create SMTP transporter
 */
function createTransporter(account: EmailAccount) {
  if (!account.smtp_host) {
    throw new Error('SMTP host not configured. Set SMTP_HOST/SMTP_SERVER or EMAIL_ACCOUNTS_JSON with smtp.host');
  }
  if (!account.smtp_user) {
    throw new Error('SMTP user not configured. Set SMTP_USER/SMTP_USERNAME or EMAIL_ACCOUNTS_JSON with smtp.user');
  }
  if (!account.smtp_pass) {
    throw new Error('SMTP password not configured. Set SMTP_PASS/SMTP_PASSWORD or EMAIL_ACCOUNTS_JSON with smtp.password');
  }

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

export function resolveFromEmail(account: EmailAccount, requestedEmail?: string): string {
  if (
    requestedEmail &&
    account.sender_emails?.length &&
    !account.sender_emails.some((email) => email.toLowerCase() === requestedEmail.toLowerCase())
  ) {
    throw new Error(`Sender ${requestedEmail} is not allowed for this account`);
  }

  return requestedEmail || account.sender_emails?.[0] || account.smtp_user;
}

function extractEmailAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim();
}

export function buildReplyRecipients(
  account: EmailAccount,
  originalEmail: Pick<EmailMessage, 'from' | 'reply_to' | 'to' | 'cc'>,
  replyAll: boolean,
  overrideRecipients?: string[]
): string[] {
  if (overrideRecipients?.length) return [...new Set(overrideRecipients)];

  const primaryRecipient = extractEmailAddress(originalEmail.reply_to || originalEmail.from);
  const recipients = [primaryRecipient];

  if (replyAll) {
    const ownAddresses = new Set(
      [account.smtp_user, ...(account.sender_emails || [])].map((email) => email.toLowerCase())
    );
    const seen = new Set([primaryRecipient.toLowerCase()]);

    for (const value of [...(originalEmail.to || []), ...(originalEmail.cc || [])]) {
      const email = extractEmailAddress(value);
      const normalized = email.toLowerCase();
      if (!ownAddresses.has(normalized) && !seen.has(normalized)) {
        recipients.push(email);
        seen.add(normalized);
      }
    }
  }

  return recipients;
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
    fromEmail?: string;
    inReplyTo?: string;
    references?: string[];
  }
): Promise<{ messageId: string; success: boolean }> {
  const transporter = createTransporter(account);

  const fromEmail = resolveFromEmail(account, options.fromEmail);

  const mailOptions: any = {
    from: options.fromName
      ? `"${options.fromName}" <${fromEmail}>`
      : fromEmail,
    to: options.to.join(', '),
    subject: options.subject,
    inReplyTo: options.inReplyTo,
    references: options.references
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
    to?: string[];
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

  const to = buildReplyRecipients(account, originalEmail, options.replyAll || false, options.to);

  // Build reply body
  let replyBody = options.body;

  if (options.includeOriginal && originalEmail.body) {
    const originalText = options.bodyType === 'html'
      ? `<br><br>---<br><strong>Original Message:</strong><br>${originalEmail.body}`
      : `\n\n---\nOriginal Message:\n${originalEmail.body}`;

    replyBody += originalText;
  }

  // Prepare attachments
  const attachments = [...(options.additionalAttachments || [])];
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
    fromName: account.default_from_name,
    inReplyTo: originalEmail.message_id,
    references: originalEmail.message_id ? [originalEmail.message_id] : undefined
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
  const attachments = [...(options.additionalAttachments || [])];
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
