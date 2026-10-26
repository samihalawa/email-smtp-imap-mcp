/**
 * Optional message properties for sending and drafts: Reply-To, priority, read receipt, custom headers
 */

export interface MessageExtras {
  replyTo?: string;
  priority?: 'high' | 'normal' | 'low';
  readReceipt?: boolean;
  headers?: Record<string, string>;
}

// Headers the server sets itself or that would change how the message is built or routed
const RESERVED_HEADERS = new Set([
  'from', 'to', 'cc', 'bcc', 'subject', 'date', 'message-id', 'in-reply-to', 'references', 'reply-to', 'sender',
  'return-path', 'received', 'mime-version', 'content-type', 'content-transfer-encoding', 'content-disposition',
  'content-id', 'x-priority', 'x-msmail-priority', 'importance', 'disposition-notification-to'
]);

const MAX_HEADERS = 20;

function fail(message: string): never {
  throw new Error(message);
}

/**
 * Validate the tool arguments reply_to, priority, read_receipt and headers
 */
export function parseMessageExtras(args: any): MessageExtras {
  const extras: MessageExtras = {};

  if (args.reply_to !== undefined) {
    if (typeof args.reply_to !== 'string' || !/^[^\s@<>,;]+@[^\s@<>,;]+$/.test(args.reply_to.trim())) {
      fail('reply_to must be a single email address');
    }
    extras.replyTo = args.reply_to.trim();
  }

  if (args.priority !== undefined) {
    if (!['high', 'normal', 'low'].includes(args.priority)) fail('priority must be high, normal or low');
    extras.priority = args.priority;
  }

  if (args.read_receipt !== undefined) {
    if (typeof args.read_receipt !== 'boolean') fail('read_receipt must be a boolean');
    extras.readReceipt = args.read_receipt;
  }

  if (args.headers !== undefined) {
    if (!args.headers || typeof args.headers !== 'object' || Array.isArray(args.headers)) fail('headers must be an object');
    const entries = Object.entries(args.headers);
    if (entries.length > MAX_HEADERS) fail(`At most ${MAX_HEADERS} custom headers are allowed`);
    const headers: Record<string, string> = {};
    for (const [name, value] of entries) {
      if (!/^[A-Za-z][A-Za-z0-9-]{0,63}$/.test(name)) fail(`Invalid header name: ${name}`);
      if (RESERVED_HEADERS.has(name.toLowerCase())) fail(`Header ${name} cannot be set (use the dedicated field instead)`);
      if (typeof value !== 'string' || value.length > 998 || /[\r\n]/.test(value)) {
        fail(`Header ${name} must be a single-line string of at most 998 characters`);
      }
      headers[name] = value;
    }
    extras.headers = headers;
  }

  return extras;
}

/**
 * Add the extras to nodemailer mail options. fromAddress receives read receipts.
 */
export function applyMessageExtras(mailOptions: any, extras: MessageExtras | undefined, fromAddress: string): void {
  if (!extras) return;
  if (extras.replyTo) mailOptions.replyTo = extras.replyTo;
  const headers: Record<string, string> = { ...(extras.headers || {}) };
  // Written as plain headers: nodemailer's own priority option is not applied when only composing (drafts, sent copy)
  if (extras.priority === 'high') {
    Object.assign(headers, { 'X-Priority': '1 (Highest)', 'X-MSMail-Priority': 'High', Importance: 'High' });
  } else if (extras.priority === 'low') {
    Object.assign(headers, { 'X-Priority': '5 (Lowest)', 'X-MSMail-Priority': 'Low', Importance: 'Low' });
  }
  if (extras.readReceipt) headers['Disposition-Notification-To'] = fromAddress;
  if (Object.keys(headers).length > 0) mailOptions.headers = headers;
}

/**
 * Validate IMAP keywords (custom flags). System flags start with a backslash and are not allowed.
 */
export function parseKeywords(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0 || value.length > 10) fail(`${fieldName} must be an array of 1 to 10 keywords`);
  for (const keyword of value) {
    if (typeof keyword !== 'string' || !/^[A-Za-z0-9$][A-Za-z0-9_.$-]{0,49}$/.test(keyword)) {
      fail(`${fieldName} entries must be keywords of letters, digits and _ . $ - (no spaces or backslashes): ${String(keyword)}`);
    }
  }
  return value as string[];
}
