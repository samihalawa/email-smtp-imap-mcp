/**
 * Type definitions for the email MCP server
 */

export interface EmailAccount {
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_pass: string;
  imap_user: string;
  imap_pass: string;
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
  default_from_name?: string;
  sender_emails?: string[];
  save_to_sent?: boolean;
  sent_folder?: string;
  read_only?: boolean;
  allow_delete?: boolean;
  allow_permanent_delete?: boolean;
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
  is_answered?: boolean;
  is_forwarded?: boolean;
  is_draft?: boolean;
  keyword?: string;
  no_keyword?: string;
  cc?: string;
  bcc?: string;
  min_size?: number;
  max_size?: number;
  after_date?: string;
  before_date?: string;
}

export interface EmailAttachment {
  filename: string;
  content: string; // Base64 encoded
  content_type?: string;
}

export interface AttachmentInfo {
  part: string;
  filename: string;
  content_type: string;
  size: number;
}

export interface EmailMessage {
  id: string;
  thread_id?: string;
  message_id?: string;
  subject: string;
  from: string;
  reply_to?: string;
  to: string[];
  cc?: string[];
  date: string;
  snippet?: string;
  body?: string;
  is_unread: boolean;
  is_flagged: boolean;
  has_attachments: boolean;
  attachments?: EmailAttachment[];
  attachment_list?: AttachmentInfo[];
  keywords?: string[];
}

export interface EmailFolder {
  name: string;
  path: string;
  delimiter?: string;
  parent?: string;
  special_use?: string;
  subscribed?: boolean;
  selectable?: boolean;
  unread_count?: number;
  total_count?: number;
}
