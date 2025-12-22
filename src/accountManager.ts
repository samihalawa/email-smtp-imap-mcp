/**
 * Email account configuration management
 */

import { EmailAccount, EmailAccounts } from './types.js';

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

        // Check if this is the new nested format
        if (cfg.smtp && cfg.imap) {
          accounts[accountName] = {
            smtp_host: cfg.smtp.host,
            smtp_port: cfg.smtp.port || 587,
            smtp_secure: cfg.smtp.secure !== undefined ? cfg.smtp.secure : (cfg.smtp.port === 465),
            smtp_user: cfg.smtp.user,
            smtp_pass: cfg.smtp.password,
            imap_host: cfg.imap.host,
            imap_port: cfg.imap.port || 993,
            imap_secure: cfg.imap.secure !== undefined ? cfg.imap.secure : (cfg.imap.port === 993),
            default_from_name: cfg.default_from_name,
            sender_emails: cfg.sender_emails
          };
        } else {
          // Old flat format - use as is
          accounts[accountName] = cfg as EmailAccount;
        }
      }

      return accounts;
    } catch (error) {
      throw new Error(`Failed to parse EMAIL_ACCOUNTS_JSON: ${error}`);
    }
  }

  // Fall back to single account from individual ENV vars
  const singleAccount: EmailAccount = {
    smtp_host: process.env.SMTP_HOST || '',
    smtp_port: parseInt(process.env.SMTP_PORT || '587'),
    smtp_secure: process.env.SMTP_SECURE === 'true',
    smtp_user: process.env.SMTP_USER || '',
    smtp_pass: process.env.SMTP_PASS || '',
    imap_host: process.env.IMAP_HOST || '',
    imap_port: parseInt(process.env.IMAP_PORT || '993'),
    imap_secure: process.env.IMAP_SECURE !== 'false', // Default to true
    default_from_name: process.env.DEFAULT_FROM_NAME
  };

  // Validate single account has required fields
  const missingFields: string[] = [];
  if (!singleAccount.smtp_host) missingFields.push('SMTP_HOST');
  if (!singleAccount.smtp_user) missingFields.push('SMTP_USER');
  if (!singleAccount.smtp_pass) missingFields.push('SMTP_PASS');
  if (!singleAccount.imap_host) missingFields.push('IMAP_HOST');

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
