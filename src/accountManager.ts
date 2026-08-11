/**
 * Email account configuration management
 */

import { EmailAccount, EmailAccounts } from './types.js';

function firstDefined(...values: Array<string | undefined>): string {
  return values.find((value) => value !== undefined && value !== '') || '';
}

function parsePort(value: unknown, fallback: number, fieldName: string): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`${fieldName} must be an integer between 1 and 65535`);
  }
  return parsed;
}

function toBoolean(value: unknown, fallback: boolean, fieldName: string): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  throw new Error(`${fieldName} must be true or false`);
}

function parseSenderEmails(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.map(String).map((email) => email.trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(',').map((email) => email.trim()).filter(Boolean);
  }
  return undefined;
}

function normalizeAccountConfig(accountName: string, cfg: any): EmailAccount {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
    throw new Error(`Account "${accountName}" must be an object`);
  }

  const smtp = cfg.smtp || {};
  const imap = cfg.imap || {};

  const smtpUser = firstDefined(smtp.user, cfg.smtp_user, cfg.SMTP_USER, cfg.SMTP_USERNAME);
  const smtpPass = firstDefined(smtp.password, smtp.pass, cfg.smtp_pass, cfg.SMTP_PASS, cfg.SMTP_PASSWORD);
  const imapUser = firstDefined(imap.user, imap.username, cfg.imap_user, cfg.IMAP_USER, cfg.IMAP_USERNAME, smtpUser);
  const imapPass = firstDefined(imap.password, imap.pass, cfg.imap_pass, cfg.IMAP_PASS, cfg.IMAP_PASSWORD, smtpPass);

  return {
    smtp_host: firstDefined(smtp.host, cfg.smtp_host, cfg.SMTP_HOST, cfg.SMTP_SERVER, cfg.MTP_SERVER),
    smtp_port: parsePort(smtp.port ?? cfg.smtp_port ?? cfg.SMTP_PORT, 587, `Account "${accountName}" SMTP port`),
    smtp_secure: toBoolean(smtp.secure ?? cfg.smtp_secure ?? cfg.SMTP_SECURE, parsePort(smtp.port ?? cfg.smtp_port ?? cfg.SMTP_PORT, 587, `Account "${accountName}" SMTP port`) === 465, `Account "${accountName}" SMTP secure`),
    smtp_user: smtpUser,
    smtp_pass: smtpPass,
    imap_user: imapUser,
    imap_pass: imapPass,
    imap_host: firstDefined(imap.host, cfg.imap_host, cfg.IMAP_HOST, cfg.IMAP_SERVER),
    imap_port: parsePort(imap.port ?? cfg.imap_port ?? cfg.IMAP_PORT, 993, `Account "${accountName}" IMAP port`),
    imap_secure: toBoolean(imap.secure ?? cfg.imap_secure ?? cfg.IMAP_SECURE, parsePort(imap.port ?? cfg.imap_port ?? cfg.IMAP_PORT, 993, `Account "${accountName}" IMAP port`) === 993, `Account "${accountName}" IMAP secure`),
    default_from_name: cfg.default_from_name || cfg.DEFAULT_FROM_NAME,
    sender_emails: parseSenderEmails(cfg.sender_emails ?? cfg.SENDER_EMAILS)
  };
}

function validateAccount(accountName: string, account: EmailAccount): void {
  const missingFields: string[] = [];
  if (!account.smtp_host) missingFields.push('smtp.host');
  if (!account.smtp_user) missingFields.push('smtp.user');
  if (!account.smtp_pass) missingFields.push('smtp.password');
  if (!account.imap_host) missingFields.push('imap.host');
  if (!account.imap_user) missingFields.push('imap.user');
  if (!account.imap_pass) missingFields.push('imap.password');
  if (missingFields.length > 0) {
    throw new Error(`Account "${accountName}" is missing required fields: ${missingFields.join(', ')}`);
  }
}

/**
 * Load email accounts from environment variables
 */
export function loadAccounts(): EmailAccounts {
  // Try JSON configuration first
  const jsonConfig = process.env.EMAIL_ACCOUNTS_JSON;
  if (jsonConfig) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonConfig);
    } catch (error) {
      throw new Error(`Failed to parse EMAIL_ACCOUNTS_JSON: ${error}`);
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('EMAIL_ACCOUNTS_JSON must be an object keyed by account name');
    }

    const entries = Object.entries(parsed);
    if (entries.length === 0) {
      throw new Error('EMAIL_ACCOUNTS_JSON must contain at least one account');
    }

    const accounts: EmailAccounts = {};
    for (const [accountName, config] of entries) {
      if (!accountName.trim()) throw new Error('Email account names must not be empty');
      const account = normalizeAccountConfig(accountName, config);
      validateAccount(accountName, account);
      accounts[accountName] = account;
    }

    const defaultAccountName = process.env.DEFAULT_EMAIL_ACCOUNT;
    if (defaultAccountName && !accounts[defaultAccountName]) {
      throw new Error(`DEFAULT_EMAIL_ACCOUNT "${defaultAccountName}" was not found. Available accounts: ${Object.keys(accounts).join(', ')}`);
    }

    return accounts;
  }

  // Fall back to single account from individual ENV vars
  const singleAccount: EmailAccount = {
    smtp_host: firstDefined(process.env.SMTP_HOST, process.env.SMTP_SERVER, process.env.MTP_SERVER),
    smtp_port: parsePort(process.env.SMTP_PORT, 587, 'SMTP_PORT'),
    smtp_secure: toBoolean(process.env.SMTP_SECURE, parsePort(process.env.SMTP_PORT, 587, 'SMTP_PORT') === 465, 'SMTP_SECURE'),
    smtp_user: firstDefined(process.env.SMTP_USER, process.env.SMTP_USERNAME),
    smtp_pass: firstDefined(process.env.SMTP_PASS, process.env.SMTP_PASSWORD),
    imap_user: firstDefined(process.env.IMAP_USER, process.env.IMAP_USERNAME, process.env.SMTP_USER, process.env.SMTP_USERNAME),
    imap_pass: firstDefined(process.env.IMAP_PASS, process.env.IMAP_PASSWORD, process.env.SMTP_PASS, process.env.SMTP_PASSWORD),
    imap_host: firstDefined(process.env.IMAP_HOST, process.env.IMAP_SERVER),
    imap_port: parsePort(process.env.IMAP_PORT, 993, 'IMAP_PORT'),
    imap_secure: toBoolean(process.env.IMAP_SECURE, parsePort(process.env.IMAP_PORT, 993, 'IMAP_PORT') === 993, 'IMAP_SECURE'),
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
  if (accountName !== undefined && (typeof accountName !== 'string' || accountName.trim() === '')) {
    throw new Error('account_name must be a non-empty string');
  }
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
