/**
 * Tool request handlers for email operations
 */

import { getAccount, loadAccounts } from './accountManager.js';
import { describeError, waitForEmails, searchEmails, findEmailIds, emptyFolder, modifyEmails, listFolders, getAttachment, createFolder, deleteFolder, renameFolder, resolveDraftsFolder } from './imapService.js';
import { sendEmail, replyToEmail, forwardEmail } from './smtpService.js';
import { createDraft, updateDraft, sendDraft } from './draftService.js';
import { EmailAccount, EmailFilters } from './types.js';
import { parseKeywords, parseMessageExtras } from './messageOptions.js';

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${fieldName} is required`);
  }
  return value;
}

function requireStringArray(value: unknown, fieldName: string, allowEmpty = false): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
    throw new Error(`${fieldName} is required and must be ${allowEmpty ? 'an array of strings' : 'a non-empty array of strings'}`);
  }
  return value;
}

function validateOptionalStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined) return undefined;
  return requireStringArray(value, fieldName, true);
}

function validateOptionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${fieldName} must be a non-empty string`);
  return value;
}

function validateOptionalBoolean(value: unknown, fieldName: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new Error(`${fieldName} must be a boolean`);
  return value;
}

function validateBodyType(value: unknown): 'plain' | 'html' {
  if (value === undefined) return 'html';
  if (value !== 'plain' && value !== 'html') throw new Error('body_type must be plain or html');
  return value;
}

function validateAttachments(value: unknown, fieldName: string): any[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error(`${fieldName} must be an array`);
  for (const attachment of value) {
    if (!attachment || typeof attachment !== 'object' || typeof attachment.filename !== 'string' || typeof attachment.content !== 'string') {
      throw new Error(`${fieldName} entries require string filename and base64 content fields`);
    }
  }
  return value;
}

/**
 * Refuse state-changing operations on read-only accounts
 */
export function assertWritable(config: EmailAccount, action: string): void {
  if (config.read_only) throw new Error(`Account is read-only: ${action} is disabled (READ_ONLY)`);
}

export function assertDeleteAllowed(config: EmailAccount, permanent: boolean, action: string): void {
  assertWritable(config, action);
  if (permanent) {
    if (!config.allow_permanent_delete) {
      throw new Error(`Permanent deletion is disabled for this account: ${action} requires ALLOW_PERMANENT_DELETE=true`);
    }
  } else if (config.allow_delete === false) {
    throw new Error(`Deleting is disabled for this account: ${action} requires ALLOW_DELETE=true`);
  }
}

export async function handleAccountsList(): Promise<string> {
  try {
    const accounts = loadAccounts();
    const accountNames = Object.keys(accounts);
    const defaultAccount = process.env.DEFAULT_EMAIL_ACCOUNT || accountNames[0];

    return JSON.stringify({
      success: true,
      count: accountNames.length,
      default_account: defaultAccount,
      accounts: accountNames.map((name) => ({
        name,
        is_default: name === defaultAccount,
        smtp_configured: Boolean(accounts[name].smtp_host),
        imap_configured: Boolean(accounts[name].imap_host),
        sender_count: accounts[name].sender_emails?.length || 1,
        read_only: Boolean(accounts[name].read_only),
        allow_delete: accounts[name].allow_delete !== false,
        allow_permanent_delete: Boolean(accounts[name].allow_permanent_delete)
      }))
    }, null, 2);
  } catch (error: any) {
    return JSON.stringify({
      success: false,
      error: describeError(error) || 'Failed to list accounts'
    }, null, 2);
  }
}

function validateSearchFilters(filters: EmailFilters): void {
    for (const stringField of ['from', 'to', 'subject'] as const) {
      validateOptionalString(filters[stringField], `filters.${stringField}`);
    }
    for (const keywordField of ['keyword', 'no_keyword'] as const) {
      if (filters[keywordField] !== undefined) parseKeywords([filters[keywordField]], `filters.${keywordField}`);
    }
    if (filters.is_forwarded !== undefined && (filters.keyword || filters.no_keyword)) {
      throw new Error('is_forwarded cannot be combined with keyword/no_keyword (use keyword "$Forwarded" instead)');
    }
    for (const stringField of ['cc', 'bcc'] as const) {
      validateOptionalString(filters[stringField], `filters.${stringField}`);
    }
    for (const booleanField of ['has_attachments', 'is_unread', 'is_flagged', 'is_answered', 'is_forwarded', 'is_draft'] as const) {
      validateOptionalBoolean(filters[booleanField], `filters.${booleanField}`);
    }
    for (const sizeField of ['min_size', 'max_size'] as const) {
      const size = filters[sizeField];
      if (size !== undefined && (!Number.isInteger(size) || size < 0)) throw new Error(`filters.${sizeField} must be a non-negative integer (bytes)`);
    }
    for (const dateField of ['after_date', 'before_date'] as const) {
      if (filters[dateField] !== undefined && (typeof filters[dateField] !== 'string' || Number.isNaN(Date.parse(filters[dateField]!)))) {
        throw new Error(`filters.${dateField} must be a valid date`);
      }
    }
}

/**
 * Handle emails_find tool
 */
export async function handleEmailsFind(args: any): Promise<string> {
  try {
    args = args || {};
    const { name, config } = getAccount(args.account_name);

    if (args.query !== undefined && typeof args.query !== 'string') throw new Error('query must be a string');
    if (args.filters !== undefined && (!args.filters || typeof args.filters !== 'object' || Array.isArray(args.filters))) {
      throw new Error('filters must be an object');
    }
    const filters: EmailFilters = args.filters || {};
    validateSearchFilters(filters);
    const limit = args.limit ?? 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('limit must be an integer between 1 and 100');
    if (args.include_content !== undefined && typeof args.include_content !== 'boolean') throw new Error('include_content must be a boolean');
    if (args.include_attachments !== undefined && typeof args.include_attachments !== 'boolean') throw new Error('include_attachments must be a boolean');
    const includeContent = args.include_content ?? false;
    const includeAttachments = args.include_attachments ?? false;

    const offset = args.offset ?? 0;
    if (!Number.isInteger(offset) || offset < 0) throw new Error('offset must be a non-negative integer');
    if (args.order !== undefined && args.order !== 'newest' && args.order !== 'oldest') throw new Error('order must be newest or oldest');

    const { emails, total } = await searchEmails(config, {
      filters,
      query: args.query,
      folder: validateOptionalString(args.folder, 'folder'),
      limit,
      offset,
      order: args.order,
      includeContent,
      includeAttachments
    });

    return JSON.stringify({
      success: true,
      account: name,
      total_found: total,
      count: emails.length,
      offset,
      has_more: offset + emails.length < total,
      ...(offset + emails.length < total ? { next_offset: offset + emails.length } : {}),
      emails
    }, null, 2);

  } catch (error: any) {
    return JSON.stringify({
      success: false,
      error: describeError(error) || 'Failed to search emails'
    }, null, 2);
  }
}

const BULK_LIMIT = 500;

function validateFilters(value: unknown): EmailFilters {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('filters must be an object');
  return value as EmailFilters;
}

/**
 * Handle emails_modify tool
 */
export async function handleEmailsModify(args: any): Promise<string> {
  try {
    args = args || {};
    const { name, config } = getAccount(args.account_name);

    for (const booleanField of ['mark_read', 'mark_unread', 'flag', 'unflag', 'mark_spam', 'mark_not_spam', 'dry_run']) {
      validateOptionalBoolean(args[booleanField], booleanField);
    }
    validateOptionalString(args.move_to_folder, 'move_to_folder');
    const copyToFolder = validateOptionalString(args.copy_to_folder, 'copy_to_folder');
    if (copyToFolder && (args.move_to_folder || args.delete)) {
      throw new Error('copy_to_folder cannot be combined with move_to_folder or delete (use move_to_folder to move)');
    }
    if (args.mark_spam && args.mark_not_spam) throw new Error('mark_spam and mark_not_spam cannot both be true');
    if ((args.mark_spam || args.mark_not_spam) && (args.move_to_folder || copyToFolder || args.delete)) {
      throw new Error('mark_spam/mark_not_spam cannot be combined with move_to_folder, copy_to_folder or delete');
    }
    const addKeywords = parseKeywords(args.add_keywords, 'add_keywords');
    const removeKeywords = parseKeywords(args.remove_keywords, 'remove_keywords');
    const folder = validateOptionalString(args.folder, 'folder');
    validateOptionalBoolean(args.delete, 'delete');
    validateOptionalBoolean(args.permanent, 'permanent');
    if (args.permanent && !args.delete) throw new Error('permanent requires delete to be true');

    const bulk = args.filters !== undefined || args.query !== undefined;
    if (bulk && args.email_ids !== undefined) throw new Error('Use either email_ids or filters/query, not both');
    if (!bulk && (args.dry_run !== undefined || args.expected_count !== undefined)) {
      throw new Error('dry_run and expected_count only apply to filters/query selections');
    }
    if (args.query !== undefined && typeof args.query !== 'string') throw new Error('query must be a string');

    if (!bulk) requireStringArray(args.email_ids, 'email_ids');
    if (args.delete && args.move_to_folder) throw new Error('delete and move_to_folder cannot be combined');

    const hasChange = args.mark_read || args.mark_unread || args.flag || args.unflag || args.move_to_folder ||
      args.delete || copyToFolder || args.mark_spam || args.mark_not_spam || addKeywords || removeKeywords;
    if (!hasChange && !args.dry_run) throw new Error('At least one modification is required');
    if (args.mark_read && args.mark_unread) {
      throw new Error('mark_read and mark_unread cannot both be true');
    }
    if (args.flag && args.unflag) {
      throw new Error('flag and unflag cannot both be true');
    }
    if (hasChange) {
      assertWritable(config, 'emails_modify');
      if (args.delete) assertDeleteAllowed(config, Boolean(args.permanent), 'emails_modify delete');
    }

    let emailIds: string[];
    let matched: { total: number; sample: Array<Record<string, unknown>> } | undefined;
    if (bulk) {
      const filters = validateFilters(args.filters);
      validateSearchFilters(filters);
      if (Object.keys(filters).length === 0 && !args.query?.trim()) {
        throw new Error('A bulk selection needs at least one filter or a query');
      }
      const uids = await findEmailIds(config, folder || 'INBOX', filters, args.query);
      if (uids.length > BULK_LIMIT) {
        throw new Error(`${uids.length} emails match; narrow the selection to at most ${BULK_LIMIT} per call`);
      }
      const sample = uids.length
        ? (await searchEmails(config, { filters, query: args.query, folder, limit: 10 })).emails
            .map((email) => ({ id: email.id, subject: email.subject, from: email.from, date: email.date }))
        : [];
      matched = { total: uids.length, sample };

      if (args.dry_run) {
        return JSON.stringify({ success: true, account: name, dry_run: true, matched: uids.length, sample }, null, 2);
      }
      if (uids.length === 0) {
        return JSON.stringify({ success: true, account: name, modified: 0, total: 0 }, null, 2);
      }
      const expected = args.expected_count;
      if (!Number.isInteger(expected)) {
        throw new Error(`${uids.length} emails match. Check them with dry_run: true, then repeat with expected_count: ${uids.length}`);
      }
      if (expected !== uids.length) {
        throw new Error(`expected_count ${expected} does not match the ${uids.length} emails that match now; run dry_run again`);
      }
      emailIds = uids.map(String);
    } else {
      emailIds = requireStringArray(args.email_ids, 'email_ids');
      if (emailIds.some((id) => !/^\d+$/.test(id) || Number(id) < 1)) {
        throw new Error('email_ids entries must be positive numeric UIDs');
      }
    }

    const result = await modifyEmails(config, emailIds, {
      markRead: args.mark_read,
      markUnread: args.mark_unread,
      flag: args.flag,
      unflag: args.unflag,
      moveToFolder: args.move_to_folder,
      copyToFolder,
      markSpam: args.mark_spam,
      markNotSpam: args.mark_not_spam,
      addKeywords,
      removeKeywords,
      delete: args.delete,
      permanent: args.permanent,
      folder
    });

    return JSON.stringify({
      success: result.success,
      account: name,
      modified: result.modified,
      total: emailIds.length,
      ...(result.deleted_to ? { deleted_to: result.deleted_to } : {}),
      ...(result.moved_to ? { moved_to: result.moved_to } : {}),
      errors: result.errors
    }, null, 2);

  } catch (error: any) {
    return JSON.stringify({
      success: false,
      error: describeError(error) || 'Failed to modify emails'
    }, null, 2);
  }
}

/**
 * Handle email_send tool
 */
export async function handleEmailSend(args: any): Promise<string> {
  try {
    args = args || {};
    const { name, config } = getAccount(args.account_name);

    assertWritable(config, 'email_send');
    const to = requireStringArray(args.to, 'to');
    const subject = requireString(args.subject, 'subject');
    const body = requireString(args.body, 'body');
    const cc = validateOptionalStringArray(args.cc, 'cc');
    const bcc = validateOptionalStringArray(args.bcc, 'bcc');
    const attachments = validateAttachments(args.attachments, 'attachments');
    const fromEmail = validateOptionalString(args.from_email, 'from_email');

    const result = await sendEmail(config, {
      to,
      subject,
      body,
      bodyType: validateBodyType(args.body_type),
      cc,
      bcc,
      attachments,
      fromName: config.default_from_name,
      fromEmail,
      extras: parseMessageExtras(args)
    });

    return JSON.stringify({
      success: result.success,
      account: name,
      message_id: result.messageId,
      ...(result.sent_copy ? { sent_copy: result.sent_copy } : {}),
      to,
      subject
    }, null, 2);

  } catch (error: any) {
    return JSON.stringify({
      success: false,
      error: describeError(error) || 'Failed to send email'
    }, null, 2);
  }
}

/**
 * Handle email_respond tool
 */
export async function handleEmailRespond(args: any): Promise<string> {
  try {
    args = args || {};
    const { name, config } = getAccount(args.account_name);

    assertWritable(config, 'email_respond');
    const emailId = requireString(args.email_id, 'email_id');
    const folder = validateOptionalString(args.folder, 'folder');
    const body = requireString(args.body, 'body');
    const to = validateOptionalStringArray(args.to, 'to');
    const additionalAttachments = validateAttachments(args.additional_attachments, 'additional_attachments');
    validateOptionalBoolean(args.include_original, 'include_original');
    validateOptionalBoolean(args.include_attachments, 'include_attachments');

    const responseType = args.response_type || 'reply';
    if (!['reply', 'reply_all', 'forward'].includes(responseType)) {
      throw new Error('response_type must be reply, reply_all, or forward');
    }

    let result;

    if (responseType === 'forward') {
      if (!to?.length) throw new Error('to is required for forward');

      result = await forwardEmail(config, emailId, {
        to,
        body,
        bodyType: validateBodyType(args.body_type),
        includeOriginal: args.include_original !== false,
        includeAttachments: args.include_attachments !== false,
        additionalAttachments,
        folder
      });

    } else {
      result = await replyToEmail(config, emailId, {
        body,
        bodyType: validateBodyType(args.body_type),
        to,
        replyAll: responseType === 'reply_all',
        includeOriginal: args.include_original !== false,
        includeAttachments: args.include_attachments !== false,
        additionalAttachments,
        folder
      });
    }

    return JSON.stringify({
      success: result.success,
      account: name,
      message_id: result.messageId,
      ...(result.sent_copy ? { sent_copy: result.sent_copy } : {}),
      response_type: responseType,
      original_email_id: emailId,
      original_flagged: result.original_flagged ?? false
    }, null, 2);

  } catch (error: any) {
    return JSON.stringify({
      success: false,
      error: describeError(error) || 'Failed to respond to email'
    }, null, 2);
  }
}

/**
 * Handle folders_list tool
 */
export async function handleFoldersList(args: any): Promise<string> {
  try {
    args = args || {};
    const { name, config } = getAccount(args.account_name);

    if (args.include_counts !== undefined && typeof args.include_counts !== 'boolean') {
      throw new Error('include_counts must be a boolean');
    }

    const folders = await listFolders(
      config,
      args.include_counts ?? false
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
      error: describeError(error) || 'Failed to list folders'
    }, null, 2);
  }
}

/**
 * Handle draft_create tool
 */
export async function handleDraftCreate(args: any): Promise<string> {
  try {
    args = args || {};
    const { name, config } = getAccount(args.account_name);

    assertWritable(config, 'draft_create');
    const replyToEmailId = validateOptionalString(args.reply_to_email_id, 'reply_to_email_id');
    const subject = replyToEmailId ? validateOptionalString(args.subject, 'subject') : requireString(args.subject, 'subject');
    const body = requireString(args.body, 'body');
    const to = validateOptionalStringArray(args.to, 'to');
    const cc = validateOptionalStringArray(args.cc, 'cc');
    const bcc = validateOptionalStringArray(args.bcc, 'bcc');
    const attachments = validateAttachments(args.attachments, 'attachments');
    validateOptionalBoolean(args.reply_all, 'reply_all');
    validateOptionalBoolean(args.include_original, 'include_original');
    if (!replyToEmailId && (args.reply_to_folder !== undefined || args.reply_all !== undefined)) {
      throw new Error('reply_to_folder and reply_all require reply_to_email_id');
    }

    const result = await createDraft(config, {
      to,
      subject,
      body,
      bodyType: validateBodyType(args.body_type),
      cc,
      bcc,
      attachments,
      fromName: config.default_from_name,
      fromEmail: validateOptionalString(args.from_email, 'from_email'),
      ...parseMessageExtras(args),
      folder: validateOptionalString(args.folder, 'folder'),
      answering: replyToEmailId
        ? {
            emailId: replyToEmailId,
            folder: validateOptionalString(args.reply_to_folder, 'reply_to_folder'),
            replyAll: args.reply_all === true,
            includeOriginal: args.include_original !== false
          }
        : undefined
    });

    return JSON.stringify({
      success: true,
      account: name,
      folder: result.folder,
      ...(result.uid !== undefined ? { email_id: String(result.uid) } : {}),
      ...(subject ? { subject } : {})
    }, null, 2);

  } catch (error: any) {
    return JSON.stringify({
      success: false,
      error: describeError(error) || 'Failed to create draft'
    }, null, 2);
  }
}

function requireUid(value: unknown, fieldName: string): string {
  const id = requireString(value, fieldName);
  if (!/^\d+$/.test(id) || Number(id) < 1) throw new Error(`${fieldName} must be a positive numeric UID`);
  return id;
}

/**
 * Handle draft_update tool
 */
export async function handleDraftUpdate(args: any): Promise<string> {
  try {
    args = args || {};
    const { name, config } = getAccount(args.account_name);

    assertWritable(config, 'draft_update');
    const emailId = requireUid(args.email_id, 'email_id');
    const changes = {
      to: validateOptionalStringArray(args.to, 'to'),
      cc: validateOptionalStringArray(args.cc, 'cc'),
      bcc: validateOptionalStringArray(args.bcc, 'bcc'),
      subject: validateOptionalString(args.subject, 'subject'),
      body: validateOptionalString(args.body, 'body'),
      bodyType: args.body_type === undefined ? undefined : validateBodyType(args.body_type),
      attachments: validateAttachments(args.attachments, 'attachments'),
      fromEmail: validateOptionalString(args.from_email, 'from_email'),
      ...parseMessageExtras(args)
    };
    if (Object.values(changes).every((value) => value === undefined)) throw new Error('At least one field to change is required');

    const result = await updateDraft(config, emailId, changes, validateOptionalString(args.folder, 'folder'));

    return JSON.stringify({
      success: true,
      account: name,
      folder: result.folder,
      previous_email_id: emailId,
      ...(result.uid !== undefined ? { email_id: String(result.uid) } : {})
    }, null, 2);

  } catch (error: any) {
    return JSON.stringify({
      success: false,
      error: describeError(error) || 'Failed to update draft'
    }, null, 2);
  }
}

/**
 * Handle draft_send tool
 */
export async function handleDraftSend(args: any): Promise<string> {
  try {
    args = args || {};
    const { name, config } = getAccount(args.account_name);

    assertWritable(config, 'draft_send');
    const emailId = requireUid(args.email_id, 'email_id');
    const result = await sendDraft(config, emailId, validateOptionalString(args.folder, 'folder'));

    return JSON.stringify({
      success: result.success,
      account: name,
      message_id: result.messageId,
      ...(result.sent_copy ? { sent_copy: result.sent_copy } : {}),
      draft_removed: result.draft_removed
    }, null, 2);

  } catch (error: any) {
    return JSON.stringify({
      success: false,
      error: describeError(error) || 'Failed to send draft'
    }, null, 2);
  }
}

/**
 * Handle draft_delete tool
 */
export async function handleDraftDelete(args: any): Promise<string> {
  try {
    args = args || {};
    const { name, config } = getAccount(args.account_name);

    const emailIds = requireStringArray(args.email_ids, 'email_ids');
    if (emailIds.some((id) => !/^\d+$/.test(id) || Number(id) < 1)) {
      throw new Error('email_ids entries must be positive numeric UIDs');
    }
    const permanent = validateOptionalBoolean(args.permanent, 'permanent') === true;
    assertDeleteAllowed(config, permanent, 'draft_delete');

    const folder = validateOptionalString(args.folder, 'folder') || await resolveDraftsFolder(config);
    const result = await modifyEmails(config, emailIds, { delete: true, permanent, folder });

    return JSON.stringify({
      success: result.success,
      account: name,
      folder,
      deleted: result.modified,
      total: emailIds.length,
      ...(result.deleted_to ? { deleted_to: result.deleted_to } : {}),
      errors: result.errors
    }, null, 2);

  } catch (error: any) {
    return JSON.stringify({
      success: false,
      error: describeError(error) || 'Failed to delete draft'
    }, null, 2);
  }
}

/**
 * Handle folder_create tool
 */
export async function handleFolderCreate(args: any): Promise<string> {
  try {
    args = args || {};
    const { name: accountName, config } = getAccount(args.account_name);
    assertWritable(config, 'folder_create');
    const path = await createFolder(config, requireString(args.name, 'name'));
    return JSON.stringify({ success: true, account: accountName, folder: path }, null, 2);
  } catch (error: any) {
    return JSON.stringify({
      success: false,
      error: describeError(error) || 'Failed to create folder'
    }, null, 2);
  }
}

/**
 * Handle folder_rename tool
 */
export async function handleFolderRename(args: any): Promise<string> {
  try {
    args = args || {};
    const { name: accountName, config } = getAccount(args.account_name);
    assertWritable(config, 'folder_rename');
    const result = await renameFolder(config, requireString(args.name, 'name'), requireString(args.new_name, 'new_name'));
    return JSON.stringify({ success: true, account: accountName, ...result }, null, 2);
  } catch (error: any) {
    return JSON.stringify({
      success: false,
      error: describeError(error) || 'Failed to rename folder'
    }, null, 2);
  }
}

/**
 * Handle folder_empty tool
 */
export async function handleFolderEmpty(args: any): Promise<string> {
  try {
    args = args || {};
    const { name: accountName, config } = getAccount(args.account_name);
    assertDeleteAllowed(config, true, 'folder_empty');
    const days = args.older_than_days;
    if (days !== undefined && (!Number.isInteger(days) || days < 0)) throw new Error('older_than_days must be a non-negative integer');
    const result = await emptyFolder(config, requireString(args.name, 'name'), days);
    return JSON.stringify({ success: true, account: accountName, ...result }, null, 2);
  } catch (error: any) {
    return JSON.stringify({
      success: false,
      error: describeError(error) || 'Failed to empty folder'
    }, null, 2);
  }
}

/**
 * Handle folder_delete tool
 */
export async function handleFolderDelete(args: any): Promise<string> {
  try {
    args = args || {};
    const { name: accountName, config } = getAccount(args.account_name);
    assertDeleteAllowed(config, true, 'folder_delete');
    const path = await deleteFolder(config, requireString(args.name, 'name'));
    return JSON.stringify({ success: true, account: accountName, deleted: path }, null, 2);
  } catch (error: any) {
    return JSON.stringify({
      success: false,
      error: describeError(error) || 'Failed to delete folder'
    }, null, 2);
  }
}

/**
 * Handle attachment_get tool
 */
export async function handleAttachmentGet(args: any): Promise<string> {
  try {
    args = args || {};
    const { name, config } = getAccount(args.account_name);

    const emailId = requireString(args.email_id, 'email_id');
    const folder = validateOptionalString(args.folder, 'folder') || 'INBOX';
    const part = validateOptionalString(args.part, 'part');
    const filename = validateOptionalString(args.filename, 'filename');
    if (!part && !filename) throw new Error('part or filename is required (see attachment_list in emails_find results)');

    const attachment = await getAttachment(config, folder, emailId, { part, filename });

    return JSON.stringify({
      success: true,
      account: name,
      email_id: emailId,
      folder,
      filename: attachment.filename,
      content_type: attachment.content_type,
      size: attachment.size,
      content: attachment.content
    }, null, 2);

  } catch (error: any) {
    return JSON.stringify({
      success: false,
      error: describeError(error) || 'Failed to get attachment'
    }, null, 2);
  }
}

/**
 * Handle emails_wait tool
 */
export async function handleEmailsWait(args: any): Promise<string> {
  try {
    args = args || {};
    const { name, config } = getAccount(args.account_name);

    const timeout = args.timeout_seconds ?? 30;
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 120) throw new Error('timeout_seconds must be an integer between 1 and 120');
    const limit = args.limit ?? 10;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('limit must be an integer between 1 and 50');
    const sinceUid = args.since_uid;
    if (sinceUid !== undefined && (!Number.isInteger(sinceUid) || sinceUid < 1)) throw new Error('since_uid must be a positive integer');
    const filters = validateFilters(args.filters);
    validateSearchFilters(filters);
    validateOptionalBoolean(args.include_content, 'include_content');
    const folder = validateOptionalString(args.folder, 'folder') || 'INBOX';

    const result = await waitForEmails(config, {
      folder,
      timeoutMs: timeout * 1000,
      sinceUid,
      filters,
      limit,
      includeContent: args.include_content === true
    });

    return JSON.stringify({
      success: true,
      account: name,
      folder,
      timed_out: result.timed_out,
      count: result.emails.length,
      next_uid: result.next_uid,
      emails: result.emails
    }, null, 2);

  } catch (error: any) {
    return JSON.stringify({
      success: false,
      error: describeError(error) || 'Failed to wait for emails'
    }, null, 2);
  }
}
