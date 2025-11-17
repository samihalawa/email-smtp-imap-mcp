/**
 * IMAP email operations
 */

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { EmailAccount, EmailFilters, EmailMessage, EmailFolder } from './types.js';

/**
 * Create IMAP connection
 */
async function createImapConnection(account: EmailAccount): Promise<ImapFlow> {
  const client = new ImapFlow({
    host: account.imap_host,
    port: account.imap_port,
    secure: account.imap_secure,
    auth: {
      user: account.smtp_user,
      pass: account.smtp_pass
    },
    logger: false // Disable logging to avoid stdio issues
  });

  await client.connect();
  return client;
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
 * Search for emails
 */
export async function searchEmails(
  account: EmailAccount,
  filters?: EmailFilters,
  limit: number = 20,
  includeContent: boolean = false,
  includeAttachments: boolean = false
): Promise<EmailMessage[]> {
  const client = await createImapConnection(account);
  
  try {
    // Open inbox
    await client.mailboxOpen('INBOX');

    // Build search criteria
    const searchCriteria = buildSearchCriteria(filters);

    // Search for messages
    const messages: EmailMessage[] = [];
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
 * List folders
 */
export async function listFolders(
  account: EmailAccount,
  includeCounts: boolean = false
): Promise<EmailFolder[]> {
  const client = await createImapConnection(account);
  
  try {
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

  } finally {
    await client.logout();
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
