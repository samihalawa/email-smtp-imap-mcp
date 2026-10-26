/**
 * Draft operations: create (optionally as a reply), update, send
 */

import { randomUUID } from 'node:crypto';
import { simpleParser, ParsedMail, AddressObject } from 'mailparser';
import { EmailAccount, EmailAttachment } from './types.js';
import { appendDraft, fetchRawMessage, getEmailById, modifyEmails, resolveDraftsFolder } from './imapService.js';
import { applyMessageExtras, MessageExtras } from './messageOptions.js';
import { buildReplyRecipients, buildSentCopy, resolveFromEmail, sendEmail, SendResult } from './smtpService.js';

export interface DraftFields extends MessageExtras {
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  bodyType?: 'plain' | 'html';
  attachments?: EmailAttachment[];
  fromName?: string;
  fromEmail?: string;
  inReplyTo?: string;
  references?: string[];
  messageId?: string;
}

export interface DraftResult {
  folder: string;
  uid?: number;
}

async function storeDraft(account: EmailAccount, fields: DraftFields, folder?: string): Promise<DraftResult> {
  const fromEmail = resolveFromEmail(account, fields.fromEmail);
  const messageId = fields.messageId || `<${randomUUID()}@${fromEmail.split('@')[1] || 'localhost'}>`;
  const mailOptions: any = {
    from: fields.fromName ? `"${fields.fromName}" <${fromEmail}>` : fromEmail,
    subject: fields.subject,
    messageId,
    date: new Date(),
    inReplyTo: fields.inReplyTo,
    references: fields.references
  };
  applyMessageExtras(mailOptions, fields, fromEmail);
  if (fields.to?.length) mailOptions.to = fields.to.join(', ');
  if (fields.cc?.length) mailOptions.cc = fields.cc.join(', ');
  if (fields.bcc?.length) mailOptions.bcc = fields.bcc.join(', ');
  if (fields.bodyType === 'plain') mailOptions.text = fields.body;
  else mailOptions.html = fields.body;
  if (fields.attachments?.length) {
    mailOptions.attachments = fields.attachments.map((att) => ({
      filename: att.filename,
      content: Buffer.from(att.content, 'base64'),
      contentType: att.content_type
    }));
  }
  return appendDraft(account, await buildSentCopy(mailOptions), folder, messageId);
}

/**
 * Save a draft in the IMAP Drafts folder. With answering, the draft answers an existing
 * message: recipients, "Re:" subject, threading headers and the quoted original are filled in.
 */
export async function createDraft(
  account: EmailAccount,
  options: Omit<DraftFields, 'subject'> & {
    subject?: string;
    folder?: string;
    answering?: { emailId: string; folder?: string; replyAll?: boolean; includeOriginal?: boolean };
  }
): Promise<DraftResult> {
  let fields: DraftFields = { ...options, subject: options.subject || '' };

  if (options.answering) {
    const original = await getEmailById(account, options.answering.emailId, false, options.answering.folder || 'INBOX');
    if (!original) throw new Error(`Email with ID ${options.answering.emailId} not found`);

    let body = options.body;
    if (options.answering.includeOriginal !== false && original.body) {
      body += options.bodyType === 'plain'
        ? `\n\n---\nOriginal Message:\n${original.body}`
        : `<br><br>---<br><strong>Original Message:</strong><br>${original.body}`;
    }
    fields = {
      ...fields,
      body,
      to: buildReplyRecipients(account, original, options.answering.replyAll || false, options.to),
      subject: options.subject || (original.subject.startsWith('Re:') ? original.subject : `Re: ${original.subject}`),
      inReplyTo: original.message_id,
      references: original.message_id ? [original.message_id] : undefined
    };
  }

  if (!fields.subject) throw new Error('subject is required');
  return storeDraft(account, fields, options.folder);
}

function addresses(value: AddressObject | AddressObject[] | undefined): string[] {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.flatMap((entry) => entry.value.map((address) => address.address || '').filter(Boolean));
}

// Headers that carry no user setting worth preserving when a draft is rewritten
const IGNORED_X_HEADERS = new Set(['x-priority', 'x-msmail-priority', 'x-mailer', 'x-original-to']);

/**
 * Reply-To, priority, read receipt and custom X- headers of a stored draft
 */
function draftExtras(parsed: ParsedMail): MessageExtras {
  const extras: MessageExtras = {};
  const replyTo = parsed.replyTo?.value?.[0]?.address;
  if (replyTo) extras.replyTo = replyTo;

  // mailparser folds X-Priority/Importance into a single "priority" header (high, normal or low)
  const priority = parsed.headers.get('priority');
  if (priority === 'high' || priority === 'low') extras.priority = priority;

  if (parsed.headers.has('disposition-notification-to')) extras.readReceipt = true;

  const headers: Record<string, string> = {};
  for (const [key, value] of parsed.headers) {
    if (key.startsWith('x-') && !IGNORED_X_HEADERS.has(key) && typeof value === 'string' && !/[\r\n]/.test(value)) {
      headers[key.replace(/(^|-)([a-z])/g, (_, dash, letter) => dash + letter.toUpperCase())] = value;
    }
  }
  if (Object.keys(headers).length > 0) extras.headers = headers;
  return extras;
}

async function loadDraft(account: EmailAccount, folder: string, emailId: string): Promise<{ parsed: ParsedMail; fields: DraftFields }> {
  const raw = await fetchRawMessage(account, folder, emailId);
  if (!raw) throw new Error(`Draft ${emailId} not found in ${folder}`);
  const parsed = await simpleParser(raw);

  const references = parsed.references === undefined
    ? undefined
    : Array.isArray(parsed.references) ? parsed.references : [parsed.references];
  const fields: DraftFields = {
    to: addresses(parsed.to),
    cc: addresses(parsed.cc),
    bcc: addresses(parsed.bcc),
    subject: parsed.subject || '',
    body: parsed.html || parsed.text || '',
    bodyType: parsed.html ? 'html' : 'plain',
    attachments: (parsed.attachments || []).map((attachment) => ({
      filename: attachment.filename || 'unnamed',
      content: attachment.content.toString('base64'),
      content_type: attachment.contentType
    })),
    fromEmail: addresses(parsed.from)[0],
    inReplyTo: parsed.inReplyTo,
    references,
    messageId: parsed.messageId,
    ...draftExtras(parsed)
  };
  return { parsed, fields };
}

/**
 * Change parts of an existing draft. IMAP cannot edit a message in place, so the draft is
 * rewritten as a new message (same Message-ID) and the old copy removed. The UID changes.
 * Fields left undefined are kept; an empty array clears to/cc/bcc or attachments.
 */
export async function updateDraft(
  account: EmailAccount,
  emailId: string,
  changes: Partial<Omit<DraftFields, 'inReplyTo' | 'references' | 'messageId'>>,
  folder?: string
): Promise<DraftResult> {
  const draftsFolder = folder || await resolveDraftsFolder(account);
  const { fields } = await loadDraft(account, draftsFolder, emailId);

  const merged: DraftFields = { ...fields, fromName: account.default_from_name };
  for (const key of Object.keys(changes) as Array<keyof typeof changes>) {
    if (changes[key] !== undefined) (merged as any)[key] = changes[key];
  }
  if (!merged.subject) throw new Error('subject must not be empty');

  const stored = await storeDraft(account, merged, draftsFolder);
  const removed = await modifyEmails(account, [emailId], { delete: true, permanent: true, folder: draftsFolder });
  if (!removed.success) {
    throw new Error(`Draft was rewritten as ${stored.uid ?? 'a new message'} but the old copy ${emailId} could not be removed`);
  }
  return stored;
}

/**
 * Send a stored draft, then remove it from the Drafts folder
 */
export async function sendDraft(
  account: EmailAccount,
  emailId: string,
  folder?: string
): Promise<SendResult & { draft_removed: boolean }> {
  const draftsFolder = folder || await resolveDraftsFolder(account);
  const { fields } = await loadDraft(account, draftsFolder, emailId);

  if (!fields.to?.length) throw new Error('Draft has no "to" recipients; add them with draft_update first');
  if (!fields.subject) throw new Error('Draft has no subject');

  const result = await sendEmail(account, {
    to: fields.to,
    subject: fields.subject,
    body: fields.body,
    bodyType: fields.bodyType,
    cc: fields.cc?.length ? fields.cc : undefined,
    bcc: fields.bcc?.length ? fields.bcc : undefined,
    attachments: fields.attachments?.length ? fields.attachments : undefined,
    fromName: account.default_from_name,
    fromEmail: fields.fromEmail,
    inReplyTo: fields.inReplyTo,
    references: fields.references,
    extras: { replyTo: fields.replyTo, priority: fields.priority, readReceipt: fields.readReceipt, headers: fields.headers }
  });

  let draftRemoved = false;
  if (result.success) {
    draftRemoved = (await modifyEmails(account, [emailId], { delete: true, permanent: true, folder: draftsFolder }).catch(() => ({ success: false }))).success;
  }
  return { ...result, draft_removed: draftRemoved };
}
