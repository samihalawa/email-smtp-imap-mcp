import nodemailer from 'nodemailer';
import { getDefaultSmtpConfig, getSmtpConfigs, SmtpServerConfig, getDefaultEmailTemplate, getEmailTemplates, EmailTemplate, logEmailActivity, EmailLogEntry } from './config.js';
import { logToFile } from "./index.js";

// Interface for email recipient
export interface EmailRecipient {
  email: string;
  name?: string;
}

// Interface for email data
export interface EmailData {
  to: EmailRecipient | EmailRecipient[];
  subject: string;
  body: string;
  from?: {
    email: string;
    name?: string;
  };
  cc?: EmailRecipient[];
  bcc?: EmailRecipient[];
  templateId?: string;
  templateData?: Record<string, any>;
}

// Interface for bulk email data
export interface BulkEmailData {
  recipients: EmailRecipient[];
  subject: string;
  body: string;
  from?: {
    email: string;
    name?: string;
  };
  cc?: EmailRecipient[];
  bcc?: EmailRecipient[];
  templateId?: string;
  templateData?: Record<string, any>;
  batchSize?: number;
  delayBetweenBatches?: number; // in milliseconds
}

// Rate limiting state
const rateLimitState = {
  lastSendTime: 0,
  messageCount: 0,
  resetTime: 0
};

/**
 * Create a nodemailer transport using SMTP config
 */
export async function createTransport(smtpConfigId?: string) {
  let smtpConfig: SmtpServerConfig;
  
  if (smtpConfigId) {
    const configs = await getSmtpConfigs();
    const config = configs.find(c => c.id === smtpConfigId);
    if (!config) {
      throw new Error(`SMTP configuration with ID ${smtpConfigId} not found`);
    }
    smtpConfig = config;
  } else {
    smtpConfig = await getDefaultSmtpConfig();
  }
  
  return nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth: {
      user: smtpConfig.auth.user,
      pass: smtpConfig.auth.pass
    }
  });
}

/**
 * Replace template variables with actual values
 */
function processTemplate(template: string, data: Record<string, any> = {}): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
    const value = data[key.trim()];
    return value !== undefined ? value : match;
  });
}

/**
 * Generate email content from template
 */
async function generateEmailContent(
  templateId: string | undefined,
  templateData: Record<string, any> | undefined,
  subject: string,
  body: string
): Promise<{ subject: string; body: string }> {
  // If no template ID is provided, use the provided subject and body
  if (!templateId) {
    return { subject, body };
  }
  
  // Get templates
  const templates = await getEmailTemplates();
  let template: EmailTemplate | undefined;
  
  if (templateId === 'default') {
    template = await getDefaultEmailTemplate();
  } else {
    template = templates.find(t => t.id === templateId);
  }
  
  // If template not found, use the provided subject and body
  if (!template) {
    console.warn(`Template with ID ${templateId} not found. Using provided subject and body.`);
    return { subject, body };
  }
  
  // Process template
  const processedSubject = processTemplate(template.subject, templateData);
  const processedBody = processTemplate(template.body, templateData);
  
  return {
    subject: processedSubject,
    body: processedBody
  };
}

/**
 * Format recipients for nodemailer
 */
function formatRecipient(recipient: EmailRecipient): string {
  if (recipient.name) {
    return `"${recipient.name}" <${recipient.email}>`;
  }
  return recipient.email;
}

/**
 * Format recipients array for nodemailer
 */
function formatRecipients(recipients: EmailRecipient | EmailRecipient[]): string | string[] {
  if (Array.isArray(recipients)) {
    return recipients.map(formatRecipient);
  }
  return formatRecipient(recipients);
}

/**
 * Send an email
 */
export async function sendEmail(data: EmailData, smtpConfigId?: string): Promise<{ success: boolean; message?: string }> {
  try {
    const transport = await createTransport(smtpConfigId);
    const smtpConfig = smtpConfigId 
      ? (await getSmtpConfigs()).find(c => c.id === smtpConfigId) 
      : await getDefaultSmtpConfig();
    
    if (!smtpConfig) {
      return { success: false, message: 'SMTP configuration not found' };
    }
    
    // Generate email content from template if templateId is provided
    const { subject, body } = await generateEmailContent(
      data.templateId,
      data.templateData,
      data.subject,
      data.body
    );
    
    // Create mail options
    const mailOptions = {
      from: data.from 
        ? (data.from.name ? `"${data.from.name}" <${data.from.email}>` : data.from.email)
        : (smtpConfig.auth.user),
      to: formatRecipients(data.to),
      subject,
      html: body,
      cc: data.cc ? formatRecipients(data.cc) : undefined,
      bcc: data.bcc ? formatRecipients(data.bcc) : undefined
    };
    
    // Send email
    const info = await transport.sendMail(mailOptions);
    
    // Log email activity
    const recipients = Array.isArray(data.to) ? data.to : [data.to];
    for (const recipient of recipients) {
      const logEntry: EmailLogEntry = {
        timestamp: new Date().toISOString(),
        smtpConfig: smtpConfig.id,
        templateId: data.templateId,
        recipient: recipient.email,
        subject,
        success: true,
        message: `Message sent: ${info.messageId}`
      };
      await logEmailActivity(logEntry);
    }
    
    return { success: true, message: `Message sent: ${info.messageId}` };
  } catch (error) {
    logToFile(`Error sending email: ${error}`);
    
    // Log failed email activity
    if (data.to) {
      const recipients = Array.isArray(data.to) ? data.to : [data.to];
      for (const recipient of recipients) {
        const logEntry: EmailLogEntry = {
          timestamp: new Date().toISOString(),
          smtpConfig: smtpConfigId || 'unknown',
          templateId: data.templateId,
          recipient: recipient.email,
          subject: data.subject,
          success: false,
          message: error instanceof Error ? error.message : 'Unknown error sending email'
        };
        await logEmailActivity(logEntry);
      }
    }
    
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Unknown error sending email'
    };
  }
}

/**
 * Send emails in bulk to multiple recipients
 */
export async function sendBulkEmails(data: BulkEmailData, smtpConfigId?: string): Promise<{
  success: boolean;
  totalSent: number;
  totalFailed: number;
  failures?: { email: string; error: string }[];
  message?: string;
}> {
  try {
    const { recipients, batchSize = 10, delayBetweenBatches = 1000 } = data;
    
    if (!recipients || recipients.length === 0) {
      return { 
        success: false, 
        totalSent: 0, 
        totalFailed: 0,
        message: 'No recipients provided'
      };
    }
    
    const failures: { email: string; error: string }[] = [];
    let totalSent = 0;
    
    // Process recipients in batches
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      
      // Send emails to the batch (one by one to allow for individual template processing)
      const promises = batch.map(async (recipient) => {
        try {
          // Create email data for single recipient using the bulk data
          const emailData: EmailData = {
            to: recipient,
            subject: data.subject,
            body: data.body,
            from: data.from,
            cc: data.cc,
            bcc: data.bcc,
            templateId: data.templateId,
            templateData: {
              ...data.templateData,
              email: recipient.email,
              name: recipient.name || ''
            }
          };
          
          const result = await sendEmail(emailData, smtpConfigId);
          
          if (result.success) {
            totalSent++;
            return { success: true };
          } else {
            failures.push({ email: recipient.email, error: result.message || 'Unknown error' });
            return { success: false, error: result.message };
          }
        } catch (error) {
          failures.push({ 
            email: recipient.email, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
          return { success: false, error };
        }
      });
      
      await Promise.all(promises);
      
      // If not the last batch, wait before processing the next batch
      if (i + batchSize < recipients.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }
    
    return {
      success: totalSent > 0,
      totalSent,
      totalFailed: failures.length,
      failures: failures.length > 0 ? failures : undefined,
      message: `Successfully sent ${totalSent} out of ${recipients.length} emails`
    };
  } catch (error) {
    logToFile(`Error sending bulk emails: ${error}`);
    return { 
      success: false, 
      totalSent: 0, 
      totalFailed: data.recipients.length,
      message: error instanceof Error ? error.message : 'Unknown error sending bulk emails'
    };
  }
} 