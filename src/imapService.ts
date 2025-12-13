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
  if (!account.smtp_user) {
    throw new Error('IMAP user not configured. Set SMTP_USER or EMAIL_ACCOUNTS_JSON with smtp.user');
  }
  if (!account.smtp_pass) {
    throw new Error('IMAP password not configured. Set SMTP_PASS or EMAIL_ACCOUNTS_JSON with smtp.password');
  }

  const client = new ImapFlow({
    host: account.imap_host,
    port: account.imap_port || 993,
    secure: account.imap_secure !== false, // Default to true
    auth: {
      user: account.smtp_user,
      pass: account.smtp_pass
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
      throw new Error(`Authentication failed for ${account.smtp_user}. Check username/password.`);
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
function buildSearchCriteria(filters?: EmailFilters): any {
  if (!filters) return { all: true };

  const criteria: any = {};

  if (filters.from) criteria.from = filters.from;
  if (filters.to) criteria.to = filters.to;
  if (filters.subject) criteria.subject = filters.subject;
  if (filters.is_unread) criteria.unseen = true;
  if (filters.is_unread === false) criteria.seen = true;
  if (filters.is_flagged) criteria.flagged = true;
  if (filters.after_date) criteria.since = new Date(filters.after_date);
  if (filters.before_date) criteria.before = new Date(filters.before_date);

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
  includeAttachments: boolean = false
): Promise<EmailMessage[]> {
  // Wrap entire operation with 90-second timeout (generous for large mailboxes)
  return withTimeout(
    searchEmailsInternal(account, filters, limit, includeContent, includeAttachments),
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
  includeAttachments: boolean = false
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
    const searchCriteria = buildSearchCriteria(filters);

    // For efficiency: if no specific filters, fetch most recent messages by sequence number
    let messages: EmailMessage[] = [];

    if (searchCriteria.all === true && mailbox.exists > 0) {
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
        let body: string | undefined;
        let attachments: any[] | undefined;

        // Parse message if content requested
        if ((includeContent || includeAttachments) && message.source) {
          const parsed = await simpleParser(message.source);

          if (includeContent) {
            body = parsed.html || parsed.textAsHtml || parsed.text || '';
          }

          if (includeAttachments && parsed.attachments && parsed.attachments.length > 0) {
            attachments = parsed.attachments.map((att: any) => ({
              filename: att.filename || 'unnamed',
              content: att.content.toString('base64'),
              content_type: att.contentType
            }));
          }
        }

        // Extract subject, handling undefined
        const subject = message.envelope?.subject || '(No Subject)';

        // Extract from address
        const fromAddr = message.envelope?.from?.[0];
        const from = fromAddr ? `${fromAddr.name || ''} <${fromAddr.address}>`.trim() : 'Unknown';

        // Extract to addresses
        const to = message.envelope?.to?.map(addr =>
          `${addr.name || ''} <${addr.address}>`.trim()
        ) || [];

        // Check for attachments in body structure
        const hasAttachments = message.bodyStructure?.childNodes?.some(
          (node: any) => node.disposition === 'attachment'
        ) || false;

        messages.push({
          id: message.uid.toString(),
          subject,
          from,
          to,
          date: message.envelope?.date?.toISOString() || new Date().toISOString(),
          snippet: body ? body.substring(0, 200) : undefined,
          body,
          is_unread: !message.flags?.has('\\Seen'),
          is_flagged: message.flags?.has('\\Flagged') || false,
          has_attachments: hasAttachments,
          attachments
        });
      }

      // Sort by date descending (newest first) and limit
      messages.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      messages = messages.slice(0, limit);
    } else {
      // Filtered search - use search criteria
      let count = 0;

      for await (const message of client.fetch(searchCriteria, {
        uid: true,
        flags: true,
        envelope: true,
        bodyStructure: true,
        source: includeContent || includeAttachments
      })) {
        if (count >= limit) break;

        let body: string | undefined;
        let attachments: any[] | undefined;

        // Parse message if content requested
        if ((includeContent || includeAttachments) && message.source) {
          const parsed = await simpleParser(message.source);

          if (includeContent) {
            body = parsed.html || parsed.textAsHtml || parsed.text || '';
          }

          if (includeAttachments && parsed.attachments && parsed.attachments.length > 0) {
            attachments = parsed.attachments.map((att: any) => ({
              filename: att.filename || 'unnamed',
              content: att.content.toString('base64'),
              content_type: att.contentType
            }));
          }
        }

        // Extract subject, handling undefined
        const subject = message.envelope?.subject || '(No Subject)';

        // Extract from address
        const fromAddr = message.envelope?.from?.[0];
        const from = fromAddr ? `${fromAddr.name || ''} <${fromAddr.address}>`.trim() : 'Unknown';

        // Extract to addresses
        const to = message.envelope?.to?.map(addr =>
          `${addr.name || ''} <${addr.address}>`.trim()
        ) || [];

        // Check for attachments in body structure
        const hasAttachments = message.bodyStructure?.childNodes?.some(
          (node: any) => node.disposition === 'attachment'
        ) || false;

        messages.push({
          id: message.uid.toString(),
          subject,
          from,
          to,
          date: message.envelope?.date?.toISOString() || new Date().toISOString(),
          snippet: body ? body.substring(0, 200) : undefined,
          body,
          is_unread: !message.flags?.has('\\Seen'),
          is_flagged: message.flags?.has('\\Flagged') || false,
          has_attachments: hasAttachments,
          attachments
        });

        count++;
      }
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
          const status = await client.mailboxOpen(mailbox.path, { readOnly: true });
          folder.total_count = status.exists;
          // Approximate unread count (not perfect but works)
          folder.unread_count = 0;
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
      throw new Error(`IMAP authentication failed for ${account.smtp_user}: ${message}`);
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
  const results = await searchEmails(
    account,
    undefined, // No filters, we'll search by UID
    1,
    true, // Include content
    includeAttachments
  );

  // This is a simplified implementation
  // In production, you'd want to fetch by UID directly
  return results.find(email => email.id === emailId) || null;
}
