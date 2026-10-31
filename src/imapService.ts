/**
 * IMAP email operations
 */

import { DEFAULT_CIPHERS } from 'node:tls';
import { appendFileSync } from 'node:fs';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { AttachmentInfo, EmailAccount, EmailFilters, EmailMessage, EmailFolder } from './types.js';

/**
 * Set IMAP_DEBUG_LOG=/path/to/file to record the IMAP conversation (passwords are masked by ImapFlow,
 * but the log contains folder names, subjects and addresses). Nothing is logged by default.
 */
function imapLogger(): any {
  const file = process.env.IMAP_DEBUG_LOG;
  if (!file) return false;
  const write = (level: string) => (entry: unknown) => {
    try {
      appendFileSync(file, `${new Date().toISOString()} ${level} ${JSON.stringify(entry)}\n`);
    } catch {
      // Logging must never break a mail operation
    }
  };
  return { debug: write('debug'), info: write('info'), warn: write('warn'), error: write('error'), fatal: write('fatal'), trace: write('trace') };
}

/**
 * Message of an IMAP error including what the server said ("Command failed" alone says little)
 */
export function describeError(error: any): string {
  const message = error?.message || String(error);
  const detail = [error?.serverResponseCode, error?.responseText].filter(Boolean).join(' ');
  return detail && !message.includes(detail) ? `${message}: ${detail}` : message;
}

/**
 * Open a new IMAP connection with timeout and error handling
 */
async function connectImap(account: EmailAccount, pooled = false): Promise<ImapFlow> {
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
    secure: account.imap_secure !== false, // Default to implicit TLS
    doSTARTTLS: account.imap_secure === false ? true : undefined,
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true, minDHSize: 2048, ciphers: `${DEFAULT_CIPHERS}:@SECLEVEL=2` },
    auth: {
      user: account.imap_user,
      pass: account.imap_pass
    },
    logger: imapLogger(), // Off by default: logging to stdout would corrupt the MCP stdio stream
    disableAutoIdle: pooled, // A parked connection stays quiet; tools that wait for mail open their own
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
      throw new Error(`SSL/TLS error connecting to ${account.imap_host}. Check the provider TLS port, hostname and certificate chain; do not disable encryption or certificate validation.`);
    }
    if (message.includes('Invalid credentials') || message.includes('authentication') || message.includes('AUTH') || message.includes('login')) {
      throw new Error(`Authentication failed for ${account.imap_user}. Check username/password.`);
    }
    throw new Error(`IMAP connection failed: ${message}`);
  }

  return client;
}

/**
 * Connections are kept open briefly and reused, because logging in is the slowest part of most
 * operations and providers rate-limit logins. IMAP_KEEPALIVE_SECONDS=0 opens one connection per call.
 */
interface PoolEntry {
  client?: ImapFlow;
  busy: boolean;
  waiters: Array<() => void>;
  timer?: NodeJS.Timeout;
  lastUsed: number;
}

const pool = new Map<string, PoolEntry>();
const LIVENESS_CHECK_AFTER_MS = 10000;

function keepAliveMs(): number {
  const raw = process.env.IMAP_KEEPALIVE_SECONDS;
  if (raw === undefined || raw === '') return 30000;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 30000;
}

function poolKey(account: EmailAccount): string {
  return [account.imap_host, account.imap_port, account.imap_secure, account.imap_user].join('|');
}

function dropClient(entry: PoolEntry): void {
  const client = entry.client;
  entry.client = undefined;
  if (client) client.logout().catch(() => {});
}

function release(entry: PoolEntry): void {
  entry.busy = false;
  entry.lastUsed = Date.now();
  if (entry.client && !entry.client.usable) entry.client = undefined;
  const next = entry.waiters.shift();
  if (next) {
    next();
    return;
  }
  entry.timer = setTimeout(() => dropClient(entry), keepAliveMs());
  entry.timer.unref();
}

/**
 * Get a connection for the account. The returned client behaves like an ImapFlow client, but logout()
 * hands it back to the pool instead of closing it. One operation at a time uses a connection.
 */
async function createImapConnection(account: EmailAccount): Promise<ImapFlow> {
  if (keepAliveMs() === 0) return connectImap(account);

  const key = poolKey(account);
  let entry = pool.get(key);
  if (!entry) {
    entry = { busy: false, waiters: [], lastUsed: 0 };
    pool.set(key, entry);
  }
  while (entry.busy) await new Promise<void>((resolve) => entry!.waiters.push(resolve));
  entry.busy = true;
  if (entry.timer) clearTimeout(entry.timer);

  try {
    if (entry.client && entry.client.usable && Date.now() - entry.lastUsed > LIVENESS_CHECK_AFTER_MS) {
      await withTimeout(entry.client.noop(), 5000, 'Connection check timed out').catch(() => dropClient(entry!));
    }
    if (!entry.client || !entry.client.usable) {
      entry.client = undefined;
      entry.client = await connectImap(account, true);
    }
  } catch (error) {
    release(entry);
    throw error;
  }

  const held = entry;
  const client = held.client!;
  let released = false;
  return new Proxy(client, {
    get(target, property) {
      if (property === 'logout') {
        return async () => {
          if (released) return;
          released = true;
          // Hand the connection back without a selected mailbox: a leftover read-only selection would
          // silently drop the flags of a later APPEND to the same folder
          if (target.usable && target.mailbox) await target.mailboxClose().catch(() => {});
          release(held);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}

/**
 * Close all parked connections, e.g. when the MCP client disconnects
 */
export async function closeImapConnections(): Promise<void> {
  const closing: Promise<unknown>[] = [];
  for (const entry of pool.values()) {
    if (entry.timer) clearTimeout(entry.timer);
    const client = entry.client;
    entry.client = undefined;
    if (client) closing.push(client.logout().catch(() => {}));
  }
  pool.clear();
  await Promise.all(closing);
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
  if (filters?.is_answered !== undefined) criteria.answered = filters.is_answered;
  if (filters?.is_draft !== undefined) criteria.draft = filters.is_draft;
  if (filters?.is_forwarded === true) criteria.keyword = '$Forwarded';
  if (filters?.is_forwarded === false) criteria.unKeyword = '$Forwarded';
  if (filters?.keyword) criteria.keyword = filters.keyword;
  if (filters?.no_keyword) criteria.unKeyword = filters.no_keyword;
  if (filters?.cc) criteria.cc = filters.cc;
  if (filters?.bcc) criteria.bcc = filters.bcc;
  if (filters?.min_size !== undefined) criteria.larger = filters.min_size;
  if (filters?.max_size !== undefined) criteria.smaller = filters.max_size;
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

export interface SearchOptions {
  filters?: EmailFilters;
  query?: string;
  folder?: string;
  limit?: number;
  offset?: number;
  order?: 'newest' | 'oldest';
  includeContent?: boolean;
  includeAttachments?: boolean;
}

export interface SearchResult {
  emails: EmailMessage[];
  total: number;
}

/**
 * UIDs of all matching messages, newest first. The mailbox must already be open.
 */
async function matchingUids(client: ImapFlow, filters?: EmailFilters, query?: string, uidRange?: string): Promise<number[]> {
  const criteria = buildSearchCriteria(filters, query);
  if (uidRange) {
    // The range already restricts the search, so "all" must not remain
    delete criteria.all;
    criteria.uid = uidRange;
  }
  const found = await client.search(criteria, { uid: true });
  let uids = found ? [...found].sort((a, b) => b - a) : [];

  // Attachments are only known from BODYSTRUCTURE, so this filter needs a metadata pass
  if (filters?.has_attachments !== undefined && uids.length > 0) {
    const wanted = filters.has_attachments;
    const matching = new Set<number>();
    for (let i = 0; i < uids.length; i += 200) {
      for await (const message of client.fetch(uids.slice(i, i + 200), { uid: true, bodyStructure: true }, { uid: true })) {
        if (structureHasAttachment(message.bodyStructure) === wanted) matching.add(message.uid);
      }
    }
    uids = uids.filter((uid) => matching.has(uid));
  }
  return uids;
}

export interface WaitOptions {
  folder?: string;
  timeoutMs: number;
  sinceUid?: number;
  filters?: EmailFilters;
  limit?: number;
  includeContent?: boolean;
}

export interface WaitResult {
  emails: EmailMessage[];
  timed_out: boolean;
  next_uid: number;
}

const WAIT_POLL_MS = 15000;

/**
 * Wait for new messages in a folder. Uses IMAP IDLE where the server pushes news, and re-checks every
 * 15 seconds anyway so servers without IDLE work too. Returns as soon as a matching new message exists.
 */
export async function waitForEmails(account: EmailAccount, options: WaitOptions): Promise<WaitResult> {
  // Never hang longer than asked: a stuck connection must end the tool call, not the MCP client's patience
  return withTimeout(waitForEmailsInternal(account, options), options.timeoutMs + 20000, 'Waiting for mail timed out; the connection did not answer');
}

async function waitForEmailsInternal(account: EmailAccount, options: WaitOptions): Promise<WaitResult> {
  const folder = options.folder || 'INBOX';
  const client = await connectImap(account); // own connection: it sits in IDLE for the whole wait
  try {
    const mailbox = await withTimeout(client.mailboxOpen(folder, { readOnly: true }), 10000, 'Mailbox open timed out');
    const startUid = options.sinceUid ?? mailbox.uidNext;
    const deadline = Date.now() + options.timeoutMs;

    let wake: (() => void) | undefined;
    client.on('exists', () => wake?.());

    const newUids = async (): Promise<number[]> =>
      (await matchingUids(client, options.filters, undefined, `${startUid}:*`)).filter((uid) => uid >= startUid).sort((a, b) => a - b);

    let uids = await newUids();
    while (uids.length === 0 && Date.now() < deadline) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, Math.min(WAIT_POLL_MS, deadline - Date.now()));
        wake = () => {
          clearTimeout(timer);
          resolve();
        };
        // ImapFlow only idles by itself after a delay; start now. The next command ends the IDLE again.
        client.idle().catch(() => {});
      });
      wake = undefined;
      uids = await newUids();
    }

    const emails: EmailMessage[] = [];
    const page = uids.slice(0, options.limit ?? 10);
    if (page.length > 0) {
      const byUid = new Map<number, EmailMessage>();
      for await (const message of client.fetch(page, {
        uid: true,
        flags: true,
        envelope: true,
        bodyStructure: true,
        source: Boolean(options.includeContent)
      }, { uid: true })) {
        byUid.set(message.uid, await mapMessage(message, Boolean(options.includeContent), false));
      }
      emails.push(...page.flatMap((uid) => byUid.get(uid) || []));
    }
    const nextUid = uids.length > 0 ? Math.max(...uids) + 1 : Math.max(startUid, client.mailbox ? (client.mailbox as any).uidNext : startUid);
    return { emails, timed_out: uids.length === 0, next_uid: nextUid };
  } finally {
    // This connection is private to the call: if a polite logout stalls, just drop the socket
    await withTimeout(client.logout(), 5000, 'Logout timed out').catch(() => client.close());
  }
}

/**
 * Find the UIDs matching a search without fetching the messages (for bulk actions)
 */
export async function findEmailIds(
  account: EmailAccount,
  folder: string,
  filters?: EmailFilters,
  query?: string
): Promise<number[]> {
  const client = await createImapConnection(account);
  try {
    await client.mailboxOpen(folder, { readOnly: true });
    return await matchingUids(client, filters, query);
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * Search for emails with timeout protection
 */
export async function searchEmails(account: EmailAccount, options: SearchOptions = {}): Promise<SearchResult> {
  // Wrap entire operation with 90-second timeout (generous for large mailboxes)
  return withTimeout(
    searchEmailsInternal(account, options),
    90000,
    'Email search operation timed out after 90 seconds - try reducing limit or adding filters'
  );
}

async function searchEmailsInternal(account: EmailAccount, options: SearchOptions): Promise<SearchResult> {
  const { filters, query, folder = 'INBOX', limit = 20, offset = 0, order = 'newest' } = options;
  const includeContent = options.includeContent ?? false;
  const includeAttachments = options.includeAttachments ?? false;
  const client = await createImapConnection(account);

  try {
    await withTimeout(
      client.mailboxOpen(folder, { readOnly: Boolean(account.read_only) }),
      10000,
      'Mailbox open timed out'
    );

    const uids = await matchingUids(client, filters, query);
    if (order === 'oldest') uids.reverse();
    const pageUids = uids.slice(offset, offset + limit);

    const byUid = new Map<number, EmailMessage>();
    if (pageUids.length > 0) {
      for await (const message of client.fetch(pageUids, {
        uid: true,
        flags: true,
        envelope: true,
        bodyStructure: true,
        source: includeContent || includeAttachments
      }, { uid: true })) {
        byUid.set(message.uid, await mapMessage(message, includeContent, includeAttachments));
      }
    }

    return {
      emails: pageUids.flatMap((uid) => byUid.get(uid) || []),
      total: uids.length
    };

  } finally {
    await client.logout().catch(() => {});
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
    delete?: boolean;
    permanent?: boolean;
    copyToFolder?: string;
    markSpam?: boolean;
    markNotSpam?: boolean;
    addKeywords?: string[];
    removeKeywords?: string[];
    folder?: string;
  }
): Promise<{ success: boolean; modified: number; errors?: string[]; deleted_to?: string; moved_to?: string }> {
  const client = await createImapConnection(account);

  try {
    await client.mailboxOpen(options.folder || 'INBOX');

    let trashFolder: string | undefined;
    let junkFolder: string | undefined;
    if ((options.delete && !options.permanent) || options.markSpam) {
      const folders = await client.list();
      if (options.delete && !options.permanent) trashFolder = resolveSpecialFolder(folders, '\\Trash', 'Trash');
      if (options.markSpam) junkFolder = resolveJunkFolder(folders);
    }
    const sourceFolder = options.folder || 'INBOX';

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

        if (options.addKeywords?.length) {
          await client.messageFlagsAdd(uid, options.addKeywords, { uid: true });
        }
        if (options.removeKeywords?.length) {
          await client.messageFlagsRemove(uid, options.removeKeywords, { uid: true });
        }

        // Flag/unflag
        if (options.flag) {
          await client.messageFlagsAdd(uid, ['\\Flagged'], { uid: true });
        }
        if (options.unflag) {
          await client.messageFlagsRemove(uid, ['\\Flagged'], { uid: true });
        }

        // ImapFlow resolves to false (instead of throwing) when the server refuses COPY/MOVE
        if (options.markSpam) {
          await client.messageFlagsAdd(uid, ['$Junk'], { uid: true });
          await client.messageFlagsRemove(uid, ['$NotJunk'], { uid: true });
          if (junkFolder !== sourceFolder && !await client.messageMove(uid, junkFolder!, { uid: true })) {
            throw new Error(`could not move to "${junkFolder}"`);
          }
        }
        if (options.markNotSpam) {
          await client.messageFlagsAdd(uid, ['$NotJunk'], { uid: true });
          await client.messageFlagsRemove(uid, ['$Junk'], { uid: true });
          if (sourceFolder !== 'INBOX' && !await client.messageMove(uid, 'INBOX', { uid: true })) {
            throw new Error('could not move to "INBOX"');
          }
        }

        if (options.copyToFolder) {
          if (!await client.messageCopy(uid, options.copyToFolder, { uid: true })) {
            throw new Error(`could not copy to "${options.copyToFolder}" (does the folder exist?)`);
          }
        }

        // Move to folder
        if (options.moveToFolder) {
          if (!await client.messageMove(uid, options.moveToFolder, { uid: true })) {
            throw new Error(`could not move to "${options.moveToFolder}" (does the folder exist?)`);
          }
        } else if (options.delete) {
          if (options.permanent) {
            await client.messageDelete(uid, { uid: true });
          } else if (!await client.messageMove(uid, trashFolder!, { uid: true })) {
            throw new Error(`could not move to "${trashFolder}" (does the Trash folder exist?)`);
          }
        }

        modified++;
      } catch (error) {
        errors.push(`Failed to modify email ${id}: ${error}`);
      }
    }

    return {
      success: errors.length === 0,
      modified,
      errors: errors.length > 0 ? errors : undefined,
      ...(trashFolder ? { deleted_to: trashFolder } : {}),
      ...(junkFolder ? { moved_to: junkFolder } : options.markNotSpam && sourceFolder !== 'INBOX' ? { moved_to: 'INBOX' } : {})
    };

  } finally {
    await client.logout();
  }
}

/**
 * Common names of the standard folders, used when a server does not flag them with RFC 6154
 * special-use attributes (German providers often use localized names only).
 */
const FOLDER_ALIASES: Record<string, string[]> = {
  '\\Sent': ['sent', 'sent items', 'sent messages', 'gesendet', 'gesendete objekte', 'gesendete elemente'],
  '\\Drafts': ['drafts', 'entwürfe', 'entwurf'],
  '\\Trash': ['trash', 'papierkorb', 'deleted items', 'deleted messages', 'gelöschte elemente', 'gelöschte objekte']
};

/**
 * Pick a folder by its RFC 6154 special-use flag, else by a well-known name, else a fallback name.
 */
export function resolveSpecialFolder(
  folders: Array<{ path: string; specialUse?: string }>,
  specialUse: string,
  fallback: string
): string {
  const flagged = folders.find((folder) => folder.specialUse === specialUse);
  if (flagged) return flagged.path;
  const aliases = FOLDER_ALIASES[specialUse] || [];
  const named = folders.find((folder) => aliases.includes(folder.path.toLowerCase()));
  return named ? named.path : fallback;
}

/**
 * The spam folder: the one flagged \\Junk, else a common name (Junk, Spam, ...)
 */
export function resolveJunkFolder(folders: Array<{ path: string; specialUse?: string }>): string {
  const flagged = folders.find((folder) => folder.specialUse === '\\Junk');
  if (flagged) return flagged.path;
  const names = ['junk', 'spam', 'junk e-mail', 'junk email', 'bulk mail'];
  const byName = folders.find((folder) => names.includes(folder.path.toLowerCase()));
  if (byName) return byName.path;
  throw new Error('No Junk/Spam folder found; create one or use move_to_folder');
}

/**
 * Permanently remove all (or only old) messages from a Trash or Junk folder
 */
export async function emptyFolder(
  account: EmailAccount,
  path: string,
  olderThanDays?: number
): Promise<{ folder: string; deleted: number }> {
  const client = await createImapConnection(account);
  try {
    const match = (await client.list()).find((folder) => folder.path === path);
    if (!match) throw new Error(`Folder not found: ${path}`);
    if (match.specialUse !== '\\Trash' && match.specialUse !== '\\Junk') {
      throw new Error(`Only Trash and Junk folders can be emptied; ${path} is not one (use emails_modify to delete messages elsewhere)`);
    }
    await client.mailboxOpen(path);
    const criteria: any = olderThanDays === undefined
      ? { all: true }
      : { before: new Date(Date.now() - olderThanDays * 86400000) };
    const uids = await client.search(criteria, { uid: true });
    if (!uids || uids.length === 0) return { folder: path, deleted: 0 };
    await withTimeout(client.messageDelete(uids, { uid: true }), 60000, 'Emptying folder timed out');
    return { folder: path, deleted: uids.length };
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * Create a folder (nested paths like "Projects/2026" use the server's delimiter)
 */
export async function createFolder(account: EmailAccount, path: string): Promise<string> {
  const client = await createImapConnection(account);
  try {
    const result = await withTimeout(client.mailboxCreate(path), 30000, 'Creating folder timed out');
    if (!result.created) throw new Error(`Folder already exists: ${result.path}`);
    // Clients that only show subscribed folders would hide it otherwise
    await client.mailboxSubscribe(result.path).catch(() => {});
    return result.path;
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * Rename a folder, or move it elsewhere in the tree by giving a new path.
 * INBOX and special-use folders (Sent, Drafts, Trash, ...) are protected.
 */
export async function renameFolder(account: EmailAccount, path: string, newPath: string): Promise<{ from: string; to: string }> {
  if (path.toUpperCase() === 'INBOX') throw new Error('INBOX cannot be renamed');
  if (path === newPath) throw new Error('new_name must differ from name');
  const client = await createImapConnection(account);
  try {
    const folders = await client.list();
    const match = folders.find((folder) => folder.path === path);
    if (!match) throw new Error(`Folder not found: ${path}`);
    if (match.specialUse) throw new Error(`Folder ${path} is a special-use folder (${match.specialUse}) and cannot be renamed`);
    if (folders.some((folder) => folder.path === newPath)) throw new Error(`Folder already exists: ${newPath}`);
    const result = await withTimeout(client.mailboxRename(path, newPath), 30000, 'Renaming folder timed out');
    // Servers keep the subscription under the old name: move it so the folder neither vanishes nor lingers in clients
    await client.mailboxUnsubscribe(path).catch(() => {});
    await client.mailboxSubscribe(result.newPath).catch(() => {});
    return { from: result.path, to: result.newPath };
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * Delete a folder. INBOX and special-use folders (Sent, Drafts, Trash, ...) are protected.
 */
export async function deleteFolder(account: EmailAccount, path: string): Promise<string> {
  if (path.toUpperCase() === 'INBOX') throw new Error('INBOX cannot be deleted');
  const client = await createImapConnection(account);
  try {
    const match = (await client.list()).find((folder) => folder.path === path);
    if (!match) throw new Error(`Folder not found: ${path}`);
    if (match.specialUse) throw new Error(`Folder ${path} is a special-use folder (${match.specialUse}) and cannot be deleted`);
    // A leftover subscription makes clients keep showing a deleted folder
    await client.mailboxUnsubscribe(path).catch(() => {});
    try {
      const result = await withTimeout(client.mailboxDelete(path), 30000, 'Deleting folder timed out');
      return result.path;
    } catch (error) {
      await client.mailboxSubscribe(path).catch(() => {});
      throw error;
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * Folder for drafts: the one flagged \\Drafts, else "Drafts"
 */
export async function resolveDraftsFolder(account: EmailAccount): Promise<string> {
  const client = await createImapConnection(account);
  try {
    return resolveSpecialFolder(await client.list(), '\\Drafts', 'Drafts');
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * Store a raw RFC 822 message as a draft (flagged \\Draft, marked read).
 * Returns the folder path and the new UID. Servers without UIDPLUS do not report
 * the UID on append, so it is looked up by Message-ID in that case.
 */
export async function appendDraft(
  account: EmailAccount,
  raw: Buffer,
  folder?: string,
  messageId?: string
): Promise<{ folder: string; uid?: number }> {
  const client = await createImapConnection(account);
  try {
    const target = folder || resolveSpecialFolder(await client.list(), '\\Drafts', 'Drafts');
    const result = await withTimeout(client.append(target, raw, ['\\Draft', '\\Seen']), 30000, 'Saving draft timed out');
    let uid: number | undefined = result ? result.uid : undefined;
    if (uid === undefined && messageId) {
      const lock = await client.getMailboxLock(target);
      try {
        const found = await client.search({ header: { 'message-id': messageId } }, { uid: true });
        uid = found && found.length ? Math.max(...found) : undefined;
      } finally {
        lock.release();
      }
    }
    return { folder: target, uid };
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * Fetch the raw RFC 822 source of one message
 */
export async function fetchRawMessage(
  account: EmailAccount,
  folder: string,
  emailId: string
): Promise<Buffer | null> {
  if (!/^\d+$/.test(emailId) || Number(emailId) < 1) {
    throw new Error(`Invalid email ID: ${emailId}`);
  }
  const client = await createImapConnection(account);
  try {
    await client.mailboxOpen(folder, { readOnly: true });
    const message = await client.fetchOne(emailId, { uid: true, source: true }, { uid: true });
    return message && message.source ? message.source : null;
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * Pick the folder for sent copies: the configured one, else the folder
 * flagged \\Sent (RFC 6154), else "Sent".
 */
export function resolveSentFolder(
  folders: Array<{ path: string; specialUse?: string }>,
  configured?: string
): string {
  if (configured) return configured;
  return resolveSpecialFolder(folders, '\\Sent', 'Sent');
}

/**
 * Store a raw RFC 822 message in the account's sent folder, marked as read.
 * Returns the folder path used.
 */
export async function appendToSentFolder(account: EmailAccount, raw: Buffer): Promise<string> {
  const client = await createImapConnection(account);
  try {
    const folder = resolveSentFolder(
      account.sent_folder ? [] : await client.list(),
      account.sent_folder
    );
    await withTimeout(client.append(folder, raw, ['\\Seen']), 30000, 'Saving sent copy timed out');
    return folder;
  } finally {
    await client.logout().catch(() => {});
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
        path: mailbox.path,
        delimiter: mailbox.delimiter,
        ...(mailbox.parentPath ? { parent: mailbox.parentPath } : {}),
        ...(mailbox.specialUse ? { special_use: mailbox.specialUse } : {}),
        subscribed: Boolean(mailbox.subscribed),
        selectable: !mailbox.flags?.has('\\Noselect')
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
  includeAttachments: boolean = false,
  folder: string = 'INBOX'
): Promise<EmailMessage | null> {
  if (!/^\d+$/.test(emailId) || Number(emailId) < 1) {
    throw new Error(`Invalid email ID: ${emailId}`);
  }

  const client = await createImapConnection(account);
  try {
    return await fetchEmailByIdFromClient(client, emailId, includeAttachments, folder);
  } finally {
    await client.logout();
  }
}

export async function fetchEmailByIdFromClient(
  client: Pick<ImapFlow, 'mailboxOpen' | 'fetchOne'>,
  emailId: string,
  includeAttachments: boolean = false,
  folder: string = 'INBOX'
): Promise<EmailMessage | null> {
  await client.mailboxOpen(folder, { readOnly: true });
  const message = await client.fetchOne(emailId, {
    uid: true,
    flags: true,
    envelope: true,
    bodyStructure: true,
    source: true
  }, { uid: true });

  return message ? mapMessage(message, true, includeAttachments) : null;
}

/**
 * Set a flag such as \\Answered or $Forwarded on a message. Returns false instead of
 * throwing: the reply or forward has already been sent when this runs.
 */
export async function flagMessage(
  account: EmailAccount,
  folder: string,
  emailId: string,
  flag: string
): Promise<boolean> {
  try {
    const client = await createImapConnection(account);
    try {
      await client.mailboxOpen(folder);
      return Boolean(await withTimeout(client.messageFlagsAdd(emailId, [flag], { uid: true }), 15000, 'Flagging timed out'));
    } finally {
      await client.logout().catch(() => {});
    }
  } catch {
    return false;
  }
}

/**
 * List attachment parts of a message from its BODYSTRUCTURE (no download needed)
 */
export function collectAttachments(node: any, out: AttachmentInfo[] = [], isRoot = true): AttachmentInfo[] {
  if (!node) return out;
  if (node.childNodes?.length) {
    for (const child of node.childNodes) collectAttachments(child, out, false);
    return out;
  }
  const disposition = String(node.disposition || '').toLowerCase();
  const filename = node.dispositionParameters?.filename || node.parameters?.name;
  const type = String(node.type || '').toLowerCase();
  const isBodyText = type === 'text/plain' || type === 'text/html';
  if (disposition === 'attachment' || (filename && !isBodyText && type !== 'message/delivery-status')) {
    out.push({
      part: node.part || (isRoot ? '1' : ''),
      filename: filename || 'unnamed',
      content_type: type || 'application/octet-stream',
      size: node.size || 0
    });
  }
  return out;
}

/**
 * Match a BODYSTRUCTURE attachment to a parsed one: by filename when unique, else by position
 */
export function pickParsedAttachment(
  parsed: Array<{ filename?: string; content: Buffer }>,
  info: AttachmentInfo,
  index: number
): { filename?: string; content: Buffer } | undefined {
  const sameName = parsed.filter((attachment) => attachment.filename === info.filename);
  if (sameName.length === 1) return sameName[0];
  return parsed[index];
}

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/**
 * Download one attachment (decoded) by part id or filename
 */
export async function getAttachment(
  account: EmailAccount,
  folder: string,
  emailId: string,
  selector: { part?: string; filename?: string }
): Promise<{ filename: string; content_type: string; size: number; content: string }> {
  if (!/^\d+$/.test(emailId) || Number(emailId) < 1) throw new Error(`Invalid email ID: ${emailId}`);
  const client = await createImapConnection(account);
  try {
    await client.mailboxOpen(folder, { readOnly: true });
    const message = await client.fetchOne(emailId, { uid: true, bodyStructure: true }, { uid: true });
    if (!message) throw new Error(`Email with ID ${emailId} not found in ${folder}`);

    const attachments = collectAttachments(message.bodyStructure);
    if (attachments.length === 0) throw new Error(`Email ${emailId} has no attachments`);
    const matches = attachments.filter((item) =>
      selector.part ? item.part === selector.part : item.filename === selector.filename
    );
    if (matches.length === 0) {
      throw new Error(`Attachment not found. Available: ${attachments.map((item) => `${item.filename} (part ${item.part})`).join(', ')}`);
    }
    if (matches.length > 1) {
      throw new Error(`Several attachments are named ${selector.filename}; select one by part: ${matches.map((item) => item.part).join(', ')}`);
    }
    const info = matches[0];
    if (info.size > MAX_ATTACHMENT_BYTES * 1.4) {
      throw new Error(`Attachment is too large (${info.size} bytes encoded, limit ${MAX_ATTACHMENT_BYTES} bytes)`);
    }

    const downloaded = await withTimeout(client.download(emailId, info.part, { uid: true }), 30000, 'Attachment download timed out');
    let data: Buffer;
    if (downloaded && downloaded.content) {
      const chunks: Buffer[] = [];
      let total = 0;
      for await (const chunk of downloaded.content) {
        total += chunk.length;
        if (total > MAX_ATTACHMENT_BYTES) throw new Error(`Attachment exceeds the ${MAX_ATTACHMENT_BYTES} byte limit`);
        chunks.push(chunk);
      }
      data = Buffer.concat(chunks);
    } else {
      // Some servers do not answer a BODY[part] fetch the way ImapFlow expects: take the part from the whole message
      const whole = await withTimeout(client.fetchOne(emailId, { uid: true, source: true }, { uid: true }), 60000, 'Message download timed out');
      if (!whole || !whole.source) throw new Error(`Could not download attachment ${info.filename}`);
      const parsed = await simpleParser(whole.source);
      const picked = pickParsedAttachment(parsed.attachments || [], info, attachments.indexOf(info));
      if (!picked) throw new Error(`Could not download attachment ${info.filename}`);
      data = picked.content;
    }
    return { filename: info.filename, content_type: info.content_type, size: data.length, content: data.toString('base64') };
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * Custom flags (keywords) of a message, i.e. everything that is not a \\System flag
 */
function keywordsOf(flags: Set<string> | undefined): string[] {
  return flags ? [...flags].filter((flag) => !flag.startsWith('\\')).sort() : [];
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
  const attachmentList = collectAttachments(message.bodyStructure);

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
    ...(keywordsOf(message.flags).length ? { keywords: keywordsOf(message.flags) } : {}),
    has_attachments: structureHasAttachment(message.bodyStructure),
    ...(attachmentList.length ? { attachment_list: attachmentList } : {}),
    attachments
  };
}
