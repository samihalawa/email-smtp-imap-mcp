/**
 * Tool request handlers for email operations
 */

import { getAccount } from './accountManager.js';
import { searchEmails, modifyEmails, listFolders } from './imapService.js';
import { sendEmail, replyToEmail, forwardEmail } from './smtpService.js';
import { EmailFilters } from './types.js';

/**
 * Handle emails_find tool
 */
export async function handleEmailsFind(args: any): Promise<string> {
  try {
    const { name, config } = getAccount(args.account_name);

    const filters: EmailFilters = args.filters || {};
    const limit = args.limit || 20;
    const includeContent = args.include_content || false;
    const includeAttachments = args.include_attachments || false;

    const emails = await searchEmails(
      config,
      filters,
      limit,
      includeContent,
      includeAttachments
    );

    return JSON.stringify({
      success: true,
      account: name,
      count: emails.length,
      emails
    }, null, 2);

  } catch (error: any) {
    return JSON.stringify({
      success: false,
      error: error.message || 'Failed to search emails'
    }, null, 2);
  }
}

/**
 * Handle emails_modify tool
 */
export async function handleEmailsModify(args: any): Promise<string> {
  try {
    const { name, config } = getAccount(args.account_name);

    if (!args.email_ids || args.email_ids.length === 0) {
      throw new Error('email_ids is required and must not be empty');
    }

    const result = await modifyEmails(config, args.email_ids, {
      markRead: args.mark_read,
      markUnread: args.mark_unread,
      flag: args.flag,
      unflag: args.unflag,
      moveToFolder: args.move_to_folder
    });

    return JSON.stringify({
      success: result.success,
      account: name,
      modified: result.modified,
      total: args.email_ids.length,
      errors: result.errors
    }, null, 2);

  } catch (error: any) {
    return JSON.stringify({
      success: false,
      error: error.message || 'Failed to modify emails'
    }, null, 2);
  }
}

/**
 * Handle email_send tool
 */
export async function handleEmailSend(args: any): Promise<string> {
  try {
    const { name, config } = getAccount(args.account_name);

    if (!args.to || args.to.length === 0) {
      throw new Error('to is required and must not be empty');
    }
    if (!args.subject) {
      throw new Error('subject is required');
    }
    if (!args.body) {
      throw new Error('body is required');
    }

    const result = await sendEmail(config, {
      to: args.to,
      subject: args.subject,
      body: args.body,
      bodyType: args.body_type || 'html',
      cc: args.cc,
      bcc: args.bcc,
      attachments: args.attachments,
      fromName: config.default_from_name
    });

    return JSON.stringify({
      success: result.success,
      account: name,
      message_id: result.messageId,
      to: args.to,
      subject: args.subject
    }, null, 2);

  } catch (error: any) {
    return JSON.stringify({
      success: false,
      error: error.message || 'Failed to send email'
    }, null, 2);
  }
}

/**
 * Handle email_respond tool
 */
export async function handleEmailRespond(args: any): Promise<string> {
  try {
    const { name, config } = getAccount(args.account_name);

    if (!args.email_id) {
      throw new Error('email_id is required');
    }
    if (!args.body) {
      throw new Error('body is required');
    }

    const responseType = args.response_type || 'reply';

    let result;
    
    if (responseType === 'forward') {
      if (!args.to || args.to.length === 0) {
        throw new Error('to is required for forward');
      }

      result = await forwardEmail(config, args.email_id, {
        to: args.to,
        body: args.body,
        bodyType: args.body_type || 'html',
        includeOriginal: args.include_original !== false,
        includeAttachments: args.include_attachments !== false,
        additionalAttachments: args.additional_attachments
      });

    } else {
      result = await replyToEmail(config, args.email_id, {
        body: args.body,
        bodyType: args.body_type || 'html',
        replyAll: responseType === 'reply_all',
        includeOriginal: args.include_original !== false,
        includeAttachments: args.include_attachments !== false,
        additionalAttachments: args.additional_attachments
      });
    }

    return JSON.stringify({
      success: result.success,
      account: name,
      message_id: result.messageId,
      response_type: responseType,
      original_email_id: args.email_id
    }, null, 2);

  } catch (error: any) {
    return JSON.stringify({
      success: false,
      error: error.message || 'Failed to respond to email'
    }, null, 2);
  }
}

/**
 * Handle folders_list tool
 */
export async function handleFoldersList(args: any): Promise<string> {
  try {
    const { name, config } = getAccount(args.account_name);

    const folders = await listFolders(
      config,
      args.include_counts || false
    );

    return JSON.stringify({
      success: true,
      account: name,
      count: folders.length,
      folders
    }, null, 2);

  } catch (error: any) {
    return JSON.stringify({
      success: false,
      error: error.message || 'Failed to list folders'
    }, null, 2);
  }
}
