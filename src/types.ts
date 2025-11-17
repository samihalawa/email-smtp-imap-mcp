/**
 * Type definitions for the email MCP server
 */

export interface EmailAccount {
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_pass: string;
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
  default_from_name?: string;
}

export interface EmailAccounts {
  [accountName: string]: EmailAccount;
}

export interface EmailFilters {
  from?: string;
  to?: string;
  subject?: string;
  has_attachments?: boolean;
  is_unread?: boolean;
  is_flagged?: boolean;
  after_date?: string;
  before_date?: string;
}

export interface EmailAttachment {
  filename: string;
  content: string; // Base64 encoded
  content_type?: string;
}

export interface EmailMessage {
  id: string;
  thread_id?: string;
  subject: string;
  from: string;
  to: string[];
  cc?: string[];
  date: string;
  snippet?: string;
  body?: string;
  is_unread: boolean;
  is_flagged: boolean;
  has_attachments: boolean;
  attachments?: EmailAttachment[];
}

export interface EmailFolder {
  name: string;
  path: string;
  unread_count?: number;
  total_count?: number;
}
