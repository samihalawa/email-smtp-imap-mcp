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
      return JSON.parse(jsonConfig);
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
  if (!singleAccount.smtp_host || !singleAccount.smtp_user || !singleAccount.smtp_pass) {
    throw new Error('Email account configuration not found. Set EMAIL_ACCOUNTS_JSON or individual SMTP_* variables.');
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
