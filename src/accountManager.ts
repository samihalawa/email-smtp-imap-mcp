/**
 * Email account configuration management
 */

import { EmailAccount, EmailAccounts } from './types.js';

function firstDefined(...values: Array<string | undefined>): string {
  return values.find((value) => value !== undefined && value !== '') || '';
}

function parsePort(value: unknown, fallback: number): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return String(value).toLowerCase() === 'true';
}

function normalizeAccountConfig(cfg: any): EmailAccount {
  const smtp = cfg.smtp || {};
  const imap = cfg.imap || {};

  const smtpUser = firstDefined(smtp.user, cfg.smtp_user, cfg.SMTP_USER, cfg.SMTP_USERNAME);
  const smtpPass = firstDefined(smtp.password, smtp.pass, cfg.smtp_pass, cfg.SMTP_PASS, cfg.SMTP_PASSWORD);
  const imapUser = firstDefined(imap.user, imap.username, cfg.imap_user, cfg.IMAP_USER, cfg.IMAP_USERNAME, smtpUser);
  const imapPass = firstDefined(imap.password, imap.pass, cfg.imap_pass, cfg.IMAP_PASS, cfg.IMAP_PASSWORD, smtpPass);

  return {
    smtp_host: firstDefined(smtp.host, cfg.smtp_host, cfg.SMTP_HOST, cfg.SMTP_SERVER, cfg.MTP_SERVER),
    smtp_port: parsePort(smtp.port ?? cfg.smtp_port ?? cfg.SMTP_PORT, 587),
    smtp_secure: toBoolean(smtp.secure ?? cfg.smtp_secure ?? cfg.SMTP_SECURE, parsePort(smtp.port ?? cfg.smtp_port ?? cfg.SMTP_PORT, 587) === 465),
    smtp_user: smtpUser,
    smtp_pass: smtpPass,
    imap_user: imapUser,
    imap_pass: imapPass,
    imap_host: firstDefined(imap.host, cfg.imap_host, cfg.IMAP_HOST, cfg.IMAP_SERVER),
    imap_port: parsePort(imap.port ?? cfg.imap_port ?? cfg.IMAP_PORT, 993),
    imap_secure: toBoolean(imap.secure ?? cfg.imap_secure ?? cfg.IMAP_SECURE, parsePort(imap.port ?? cfg.imap_port ?? cfg.IMAP_PORT, 993) === 993),
    default_from_name: cfg.default_from_name || cfg.DEFAULT_FROM_NAME,
    sender_emails: Array.isArray(cfg.sender_emails)
      ? cfg.sender_emails
      : Array.isArray(cfg.SENDER_EMAILS)
        ? cfg.SENDER_EMAILS
        : undefined
  };
}

/**
 * Load email accounts from environment variables
 */
export function loadAccounts(): EmailAccounts {
  // Try JSON configuration first
  const jsonConfig = process.env.EMAIL_ACCOUNTS_JSON;
  if (jsonConfig) {
    try {
      const parsed = JSON.parse(jsonConfig);

      // Transform nested structure to flat structure
      const accounts: EmailAccounts = {};

      for (const [accountName, config] of Object.entries(parsed as any)) {
        const cfg = config as any;

        accounts[accountName] = normalizeAccountConfig(cfg);
      }

      return accounts;
    } catch (error) {
      throw new Error(`Failed to parse EMAIL_ACCOUNTS_JSON: ${error}`);
    }
  }

  // Fall back to single account from individual ENV vars
  const singleAccount: EmailAccount = {
    smtp_host: firstDefined(process.env.SMTP_HOST, process.env.SMTP_SERVER, process.env.MTP_SERVER),
    smtp_port: parsePort(process.env.SMTP_PORT, 587),
    smtp_secure: toBoolean(process.env.SMTP_SECURE, parsePort(process.env.SMTP_PORT, 587) === 465),
    smtp_user: firstDefined(process.env.SMTP_USER, process.env.SMTP_USERNAME),
    smtp_pass: firstDefined(process.env.SMTP_PASS, process.env.SMTP_PASSWORD),
    imap_user: firstDefined(process.env.IMAP_USER, process.env.IMAP_USERNAME, process.env.SMTP_USER, process.env.SMTP_USERNAME),
    imap_pass: firstDefined(process.env.IMAP_PASS, process.env.IMAP_PASSWORD, process.env.SMTP_PASS, process.env.SMTP_PASSWORD),
    imap_host: firstDefined(process.env.IMAP_HOST, process.env.IMAP_SERVER),
    imap_port: parsePort(process.env.IMAP_PORT, 993),
    imap_secure: toBoolean(process.env.IMAP_SECURE, parsePort(process.env.IMAP_PORT, 993) === 993),
    default_from_name: process.env.DEFAULT_FROM_NAME,
    sender_emails: process.env.SENDER_EMAILS
      ?.split(',')
      .map((email) => email.trim())
      .filter(Boolean)
  };

  // Validate single account has required fields
  const missingFields: string[] = [];
  if (!singleAccount.smtp_host) missingFields.push('SMTP_HOST');
  if (!singleAccount.smtp_user) missingFields.push('SMTP_USER');
  if (!singleAccount.smtp_pass) missingFields.push('SMTP_PASS');
  if (!singleAccount.imap_host) missingFields.push('IMAP_HOST');
  if (!singleAccount.imap_user) missingFields.push('IMAP_USER');
  if (!singleAccount.imap_pass) missingFields.push('IMAP_PASS');

  if (missingFields.length > 0) {
    throw new Error(`Missing required email configuration: ${missingFields.join(', ')}. Set EMAIL_ACCOUNTS_JSON or individual environment variables.`);
  }

  // Use DEFAULT_EMAIL_ACCOUNT as the account name, or "default"
  const accountName = process.env.DEFAULT_EMAIL_ACCOUNT || 'default';
  
  return {
    [accountName]: singleAccount
  };
}

/**
 * Get a specific email account by name
 */
export function getAccount(accountName?: string): { name: string; config: EmailAccount } {
  const accounts = loadAccounts();
  
  // If no account name specified, use the default
  if (!accountName) {
    const defaultAccountName = process.env.DEFAULT_EMAIL_ACCOUNT || Object.keys(accounts)[0];
    if (!defaultAccountName) {
      throw new Error('No email accounts configured');
    }
    accountName = defaultAccountName;
  }

  const config = accounts[accountName];
  if (!config) {
    const availableAccounts = Object.keys(accounts).join(', ');
    throw new Error(`Account "${accountName}" not found. Available accounts: ${availableAccounts}`);
  }

  return { name: accountName, config };
}

/**
 * List all configured accounts
 */
export function listAccounts(): string[] {
  const accounts = loadAccounts();
  return Object.keys(accounts);
}
