/**
 * IMAP email operations
 */

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { EmailAccount, EmailFilters, EmailMessage, EmailFolder } from './types.js';

/**
 * Create IMAP connection with timeout and error handling
 */
async function createImapConnection(account: EmailAccount): Promise<ImapFlow> {
  // Validate account configuration
  if (!account.imap_host) {
    throw new Error('IMAP host not configured. Set IMAP_HOST or EMAIL_ACCOUNTS_JSON with imap.host');
  }
  if (!account.imap_user) {
    throw new Error('IMAP user not configured. Set IMAP_USER/IMAP_USERNAME or EMAIL_ACCOUNTS_JSON with imap.user');
  }
  if (!account.imap_pass) {
    throw new Error('IMAP password not configured. Set IMAP_PASS/IMAP_PASSWORD or EMAIL_ACCOUNTS_JSON with imap.password');
  }

  const client = new ImapFlow({
    host: account.imap_host,
    port: account.imap_port || 993,
    secure: account.imap_secure !== false, // Default to true
    auth: {
      user: account.imap_user,
      pass: account.imap_pass
    },
    logger: false, // Disable logging to avoid stdio issues
    connectionTimeout: 15000, // 15 second connection timeout
    greetingTimeout: 10000, // 10 second greeting timeout
    socketTimeout: 60000 // 60 second socket timeout for operations
  });

  // Handle errors to prevent unhandled exceptions
  client.on('error', (err: any) => {
    // Error will be caught by try/catch in calling functions
    // Don't use console.error as it may interfere with MCP stdio
  });

  try {
    await client.connect();
  } catch (error: any) {
    const message = error.message || String(error);
    if (message.includes('ECONNREFUSED')) {
      throw new Error(`Connection refused to ${account.imap_host}:${account.imap_port}. Check IMAP host/port settings.`);
    }
    if (message.includes('ETIMEDOUT') || message.includes('timeout')) {
      throw new Error(`Connection timed out to ${account.imap_host}:${account.imap_port}. Check network/firewall.`);
    }
    if (message.includes('certificate') || message.includes('SSL') || message.includes('TLS')) {
      throw new Error(`SSL/TLS error connecting to ${account.imap_host}. Try setting imap_secure to ${!account.imap_secure}.`);
    }
    if (message.includes('Invalid credentials') || message.includes('authentication') || message.includes('AUTH') || message.includes('login')) {
      throw new Error(`Authentication failed for ${account.imap_user}. Check username/password.`);
    }
    throw new Error(`IMAP connection failed: ${message}`);
  }

  return client;
}

/**
 * Timeout wrapper for async operations
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}

/**
 * Build IMAP search criteria from filters
 */
export function buildSearchCriteria(filters?: EmailFilters, query?: string): any {
  if (!filters && !query) return { all: true };

  const criteria: any = {};

  if (filters?.from) criteria.from = filters.from;
  if (filters?.to) criteria.to = filters.to;
  if (filters?.subject) criteria.subject = filters.subject;
  if (filters?.is_unread === true) criteria.seen = false;
  if (filters?.is_unread === false) criteria.seen = true;
  if (filters?.is_flagged !== undefined) criteria.flagged = filters.is_flagged;
  if (filters?.after_date) criteria.since = new Date(filters.after_date);
  if (filters?.before_date) criteria.before = new Date(filters.before_date);
  if (query?.trim()) {
    const text = query.trim();
    criteria.or = [
      { subject: text },
      { body: text },
      { from: text },
      { to: text }
    ];
  }

  // If no criteria specified, search all
  if (Object.keys(criteria).length === 0) {
    return { all: true };
  }

  return criteria;
}

/**
 * Search for emails with timeout protection
 */
export async function searchEmails(
  account: EmailAccount,
  filters?: EmailFilters,
  limit: number = 20,
  includeContent: boolean = false,
  includeAttachments: boolean = false,
  query?: string
): Promise<EmailMessage[]> {
  // Wrap entire operation with 90-second timeout (generous for large mailboxes)
  return withTimeout(
    searchEmailsInternal(account, filters, limit, includeContent, includeAttachments, query),
    90000,
    'Email search operation timed out after 90 seconds - try reducing limit or adding filters'
  );
}

/**
 * Internal search implementation
 */
async function searchEmailsInternal(
  account: EmailAccount,
  filters?: EmailFilters,
  limit: number = 20,
  includeContent: boolean = false,
  includeAttachments: boolean = false,
  query?: string
): Promise<EmailMessage[]> {
  const client = await createImapConnection(account);

  try {
    // Open inbox with timeout
    const mailbox = await withTimeout(
      client.mailboxOpen('INBOX'),
      10000,
      'Mailbox open timed out'
    );

    // Build search criteria
    const searchCriteria = buildSearchCriteria(filters, query);

    // For efficiency: if no specific filters, fetch most recent messages by sequence number
    let messages: EmailMessage[] = [];

    if (
      searchCriteria.all === true &&
      filters?.has_attachments === undefined &&
      mailbox.exists > 0
    ) {
      // Fetch last N messages efficiently by sequence number (much faster)
      const start = Math.max(1, mailbox.exists - limit + 1);
      const end = mailbox.exists;

      for await (const message of client.fetch(`${start}:${end}`, {
      uid: true,
      flags: true,
      envelope: true,
      bodyStructure: true,
        source: includeContent || includeAttachments
      })) {
        messages.push(await mapMessage(message, includeContent, includeAttachments));
      }

      // Sort by date descending (newest first) and limit
      messages.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      messages = messages.slice(0, limit);
    } else {
      const foundUids = await client.search(searchCriteria, { uid: true });
      const pendingUids = foundUids ? [...foundUids].sort((a, b) => b - a) : [];
      const batchSize = Math.max(50, limit);

      while (pendingUids.length > 0 && messages.length < limit) {
        const batch = pendingUids.splice(0, batchSize);
        for await (const message of client.fetch(batch, {
          uid: true,
          flags: true,
          envelope: true,
          bodyStructure: true,
          source: includeContent || includeAttachments
        }, { uid: true })) {
          const mapped = await mapMessage(message, includeContent, includeAttachments);
          if (filters?.has_attachments === undefined || mapped.has_attachments === filters.has_attachments) {
            messages.push(mapped);
          }
        }
      }

      messages.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      messages = messages.slice(0, limit);
    }

    return messages;

  } finally {
    await client.logout();
  }
}

/**
 * Modify email flags
 */
export async function modifyEmails(
  account: EmailAccount,
  emailIds: string[],
  options: {
    markRead?: boolean;
    markUnread?: boolean;
    flag?: boolean;
    unflag?: boolean;
    moveToFolder?: string;
  }
): Promise<{ success: boolean; modified: number; errors?: string[] }> {
  const client = await createImapConnection(account);

  try {
    await client.mailboxOpen('INBOX');

    const errors: string[] = [];
    let modified = 0;

    for (const id of emailIds) {
      try {
        if (!/^\d+$/.test(id) || Number(id) < 1) {
          throw new Error('email ID must be a positive numeric UID');
        }
        const uid = parseInt(id);

        // Mark read/unread
        if (options.markRead) {
          await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
        }
        if (options.markUnread) {
          await client.messageFlagsRemove(uid, ['\\Seen'], { uid: true });
        }

        // Flag/unflag
        if (options.flag) {
          await client.messageFlagsAdd(uid, ['\\Flagged'], { uid: true });
        }
        if (options.unflag) {
          await client.messageFlagsRemove(uid, ['\\Flagged'], { uid: true });
        }

        // Move to folder
        if (options.moveToFolder) {
          await client.messageMove(uid, options.moveToFolder, { uid: true });
        }

        modified++;
      } catch (error) {
        errors.push(`Failed to modify email ${id}: ${error}`);
      }
    }

    return {
      success: errors.length === 0,
      modified,
      errors: errors.length > 0 ? errors : undefined
    };

  } finally {
    await client.logout();
  }
}

/**
 * List folders with timeout protection
 */
export async function listFolders(
  account: EmailAccount,
  includeCounts: boolean = false
): Promise<EmailFolder[]> {
  // Wrap entire operation with 30-second timeout
  return withTimeout(
    listFoldersInternal(account, includeCounts),
    30000,
    'Folder list operation timed out after 30 seconds'
  );
}

/**
 * Internal list folders implementation
 */
async function listFoldersInternal(
  account: EmailAccount,
  includeCounts: boolean = false
): Promise<EmailFolder[]> {
  let client: ImapFlow | null = null;

  try {
    client = await createImapConnection(account);
    const folders: EmailFolder[] = [];
    const mailboxList = await client.list();

    for (const mailbox of mailboxList) {
      const folder: EmailFolder = {
        name: mailbox.name,
        path: mailbox.path
      };

      if (includeCounts) {
        try {
          const status = await client.status(mailbox.path, { messages: true, unseen: true });
          folder.total_count = status.messages;
          folder.unread_count = status.unseen;
        } catch (error) {
          // If we can't get counts, just skip them
        }
      }

      folders.push(folder);
    }

    return folders;

  } catch (error: any) {
    // Re-throw with more context
    const message = error.message || String(error);
    if (message.includes('ECONNREFUSED') || message.includes('ETIMEDOUT')) {
      throw new Error(`Cannot connect to IMAP server (${account.imap_host}:${account.imap_port}): ${message}`);
    }
    if (message.includes('Invalid credentials') || message.includes('authentication') || message.includes('AUTH')) {
      throw new Error(`IMAP authentication failed for ${account.imap_user}: ${message}`);
    }
    throw new Error(`IMAP error: ${message}`);
  } finally {
    if (client) {
      try {
        await client.logout();
      } catch (e) {
        // Ignore logout errors
      }
    }
  }
}

/**
 * Get a single email by ID
 */
export async function getEmailById(
  account: EmailAccount,
  emailId: string,
  includeAttachments: boolean = false
): Promise<EmailMessage | null> {
  if (!/^\d+$/.test(emailId) || Number(emailId) < 1) {
    throw new Error(`Invalid email ID: ${emailId}`);
  }

  const client = await createImapConnection(account);
  try {
    return fetchEmailByIdFromClient(client, emailId, includeAttachments);
  } finally {
    await client.logout();
  }
}

export async function fetchEmailByIdFromClient(
  client: Pick<ImapFlow, 'mailboxOpen' | 'fetchOne'>,
  emailId: string,
  includeAttachments: boolean = false
): Promise<EmailMessage | null> {
  await client.mailboxOpen('INBOX', { readOnly: true });
  const message = await client.fetchOne(emailId, {
    uid: true,
    flags: true,
    envelope: true,
    bodyStructure: true,
    source: true
  }, { uid: true });

  return message ? mapMessage(message, true, includeAttachments) : null;
}

function structureHasAttachment(node: any): boolean {
  if (!node) return false;
  if (String(node.disposition || '').toLowerCase() === 'attachment') return true;
  return node.childNodes?.some((child: any) => structureHasAttachment(child)) || false;
}

async function mapMessage(
  message: any,
  includeContent: boolean,
  includeAttachments: boolean
): Promise<EmailMessage> {
  let body: string | undefined;
  let attachments: any[] | undefined;

  if ((includeContent || includeAttachments) && message.source) {
    const parsed = await simpleParser(message.source);
    if (includeContent) body = parsed.html || parsed.textAsHtml || parsed.text || '';
    if (includeAttachments && parsed.attachments?.length) {
      attachments = parsed.attachments.map((attachment: any) => ({
        filename: attachment.filename || 'unnamed',
        content: attachment.content.toString('base64'),
        content_type: attachment.contentType
      }));
    }
  }

  const formatAddress = (address: any): string =>
    address ? `${address.name || ''} <${address.address}>`.trim() : 'Unknown';
  const envelope = message.envelope;

  return {
    id: message.uid.toString(),
    thread_id: message.threadId,
    message_id: envelope?.messageId,
    subject: envelope?.subject || '(No Subject)',
    from: formatAddress(envelope?.from?.[0]),
    reply_to: envelope?.replyTo?.[0] ? formatAddress(envelope.replyTo[0]) : undefined,
    to: envelope?.to?.map(formatAddress) || [],
    cc: envelope?.cc?.map(formatAddress) || [],
    date: envelope?.date?.toISOString() || new Date().toISOString(),
    snippet: body ? body.substring(0, 200) : undefined,
    body,
    is_unread: !message.flags?.has('\\Seen'),
    is_flagged: message.flags?.has('\\Flagged') || false,
    has_attachments: structureHasAttachment(message.bodyStructure),
    attachments
  };
}
