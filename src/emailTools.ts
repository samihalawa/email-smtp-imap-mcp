/**
 * Email MCP Tools - Clean, simple, and flexible
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const EMAIL_TOOLS: Record<string, Tool> = {
  "accounts_list": {
    name: "accounts_list",
    description: "List every configured email account and show which account is the default. Use this before other tools when multiple SMTP/IMAP accounts are configured.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },

  /**
   * Search for emails and optionally get their full content
   */
  "emails_find": {
    name: "emails_find",
    description: "Search for emails with flexible filters. Optionally get full email content. Results list attachments (name, type, size, part) in attachment_list; fetch a single one with attachment_get. include_attachments returns every attachment inline and can be very large.",
    inputSchema: {
      type: "object",
      properties: {
        account_name: {
          type: "string",
          description: "Name of the email account to use (e.g., 'work', 'personal'). If not provided, uses the default account."
        },
        query: {
          type: "string",
          description: "Text to search across subject, body, sender, and recipients (e.g., 'project update')"
        },
        filters: {
          type: "object",
          properties: {
            from: {
              type: "string",
              description: "Filter by sender email address"
            },
            to: {
              type: "string",
              description: "Filter by recipient email address"
            },
            subject: {
              type: "string",
              description: "Filter by subject line text"
            },
            has_attachments: {
              type: "boolean",
              description: "Filter emails with attachments"
            },
            is_unread: {
              type: "boolean",
              description: "Filter unread (true) or read (false) emails"
            },
            is_flagged: {
              type: "boolean",
              description: "Filter flagged/starred emails"
            },
            is_answered: {
              type: "boolean",
              description: "Filter emails that have (true) or have not (false) been replied to"
            },
            is_forwarded: {
              type: "boolean",
              description: "Filter emails that have (true) or have not (false) been forwarded"
            },
            is_draft: {
              type: "boolean",
              description: "Filter drafts"
            },
            keyword: {
              type: "string",
              description: "Only emails carrying this custom keyword (see keywords in results, add_keywords in emails_modify)"
            },
            no_keyword: {
              type: "string",
              description: "Only emails without this custom keyword"
            },
            cc: {
              type: "string",
              description: "Filter by CC address"
            },
            bcc: {
              type: "string",
              description: "Filter by BCC address"
            },
            min_size: {
              type: "number",
              description: "Only emails larger than this many bytes"
            },
            max_size: {
              type: "number",
              description: "Only emails smaller than this many bytes"
            },
            after_date: {
              type: "string",
              description: "Filter emails after this date (ISO format: YYYY-MM-DD)"
            },
            before_date: {
              type: "string",
              description: "Filter emails before this date (ISO format: YYYY-MM-DD)"
            }
          },
          description: "Structured filters for precise email search"
        },
        limit: {
          type: "number",
          minimum: 1,
          maximum: 100,
          default: 20,
          description: "Maximum number of emails to return per page (1-100)"
        },
        offset: {
          type: "number",
          minimum: 0,
          default: 0,
          description: "Number of matching emails to skip, for paging. Use next_offset from the previous result."
        },
        order: {
          type: "string",
          enum: ["newest", "oldest"],
          default: "newest",
          description: "Sort order (by arrival in the folder)"
        },
        include_content: {
          type: "boolean",
          default: false,
          description: "Include full email body content in results"
        },
        include_attachments: {
          type: "boolean",
          default: false,
          description: "Include attachment content (base64 encoded)"
        },
        folder: {
          type: "string",
          default: "INBOX",
          description: "Folder to search (e.g., 'Archive', 'Drafts', 'Trash'). Use folders_list for valid paths."
        }
      }
    }
  },

  /**
   * Wait for new mail
   */
  "emails_wait": {
    name: "emails_wait",
    description: "Wait until new email arrives in a folder, then return it. Use this to wait for a reply or a confirmation instead of searching repeatedly. Returns early as soon as a matching new message exists, or after timeout_seconds with timed_out true. Pass the returned next_uid as since_uid on the next call to continue without missing or repeating messages.",
    inputSchema: {
      type: "object",
      properties: {
        account_name: { type: "string", description: "Name of the email account to use" },
        folder: { type: "string", default: "INBOX", description: "Folder to watch" },
        timeout_seconds: {
          type: "number",
          minimum: 1,
          maximum: 120,
          default: 30,
          description: "How long to wait at most (1-120). Many clients give up on tool calls after about a minute, so prefer 30-50."
        },
        filters: {
          type: "object",
          description: "Only count new messages matching these filters (same fields as emails_find, e.g. {\"from\": \"customer@example.com\"})"
        },
        since_uid: {
          type: "number",
          description: "Report messages with at least this UID. Defaults to messages arriving from now on. Use next_uid from a previous call."
        },
        limit: { type: "number", minimum: 1, maximum: 50, default: 10, description: "Maximum number of new messages to return (oldest first)" },
        include_content: { type: "boolean", default: false, description: "Include the message bodies" }
      }
    }
  },

  /**
   * Modify email states
   */
  "emails_modify": {
    name: "emails_modify",
    description: "Change email states like read/unread, flagged, move between folders, or delete. Deleting moves messages to the Trash folder unless permanent is true, which cannot be undone.",
    inputSchema: {
      type: "object",
      properties: {
        account_name: {
          type: "string",
          description: "Name of the email account to use"
        },
        email_ids: {
          type: "array",
          items: { type: "string" },
          description: "Array of email IDs to modify (from emails_find results). Alternatively select by filters/query."
        },
        filters: {
          type: "object",
          description: "Bulk selection: modify every email matching these filters (same fields as emails_find). Requires expected_count; check the selection first with dry_run. At most 500 emails per call."
        },
        query: {
          type: "string",
          description: "Bulk selection by text search (same as emails_find query)"
        },
        dry_run: {
          type: "boolean",
          description: "With filters/query: only report how many emails match and show a sample, change nothing"
        },
        expected_count: {
          type: "number",
          description: "With filters/query: the number of matches reported by dry_run. The call is refused if the count differs."
        },
        add_keywords: {
          type: "array",
          items: { type: "string" },
          description: "Add custom IMAP keywords (labels such as 'Invoice' or '$Followup'; letters, digits, _ . $ -). Whether the server stores them permanently depends on the provider."
        },
        remove_keywords: {
          type: "array",
          items: { type: "string" },
          description: "Remove custom IMAP keywords"
        },
        mark_spam: {
          type: "boolean",
          description: "Report as spam: flag $Junk and move to the Junk/Spam folder"
        },
        mark_not_spam: {
          type: "boolean",
          description: "Report as not spam: flag $NotJunk and move back to INBOX"
        },
        mark_read: {
          type: "boolean",
          description: "Mark emails as read"
        },
        mark_unread: {
          type: "boolean",
          description: "Mark emails as unread"
        },
        flag: {
          type: "boolean",
          description: "Flag/star emails as important"
        },
        unflag: {
          type: "boolean",
          description: "Remove flag/star from emails"
        },
        move_to_folder: {
          type: "string",
          description: "Move emails to a folder (e.g., 'Archive', 'Trash', 'INBOX')"
        },
        folder: {
          type: "string",
          default: "INBOX",
          description: "Folder the email IDs belong to (IDs are per folder; use the same folder as in emails_find)"
        },
        copy_to_folder: {
          type: "string",
          description: "Copy emails to another folder, leaving the originals in place. Cannot be combined with move_to_folder or delete."
        },
        delete: {
          type: "boolean",
          description: "Delete emails: move them to the Trash folder (recoverable)"
        },
        permanent: {
          type: "boolean",
          description: "With delete: remove emails permanently instead of moving them to Trash. Cannot be undone."
        }
      },
      required: []
    }
  },

  /**
   * Send a new email
   */
  "email_send": {
    name: "email_send",
    description: "Send a new email with HTML support and file attachments. Use this to send messages, project updates, or any new email conversation.",
    inputSchema: {
      type: "object",
      properties: {
        account_name: {
          type: "string",
          description: "Name of the email account to use"
        },
        to: {
          type: "array",
          items: { type: "string" },
          description: "Array of recipient email addresses"
        },
        subject: {
          type: "string",
          description: "Email subject line"
        },
        body: {
          type: "string",
          description: "Email body content (can be plain text or HTML)"
        },
        body_type: {
          type: "string",
          enum: ["plain", "html"],
          default: "html",
          description: "Body format: 'plain' for plain text or 'html' for HTML content"
        },
        from_email: {
          type: "string",
          description: "Optional sender address. When sender_emails is configured for the account, the address must be in that allowlist."
        },
        cc: {
          type: "array",
          items: { type: "string" },
          description: "Array of CC recipient email addresses"
        },
        bcc: {
          type: "array",
          items: { type: "string" },
          description: "Array of BCC recipient email addresses"
        },
        reply_to: {
          type: "string",
          description: "Address replies should go to (Reply-To header)"
        },
        priority: {
          type: "string",
          enum: ["high", "normal", "low"],
          description: "Message priority (X-Priority/Importance headers)"
        },
        read_receipt: {
          type: "boolean",
          description: "Ask the recipient's client for a read receipt (Disposition-Notification-To the sender)"
        },
        headers: {
          type: "object",
          additionalProperties: { type: "string" },
          description: "Custom headers as name/value pairs, e.g. {\"X-Ticket\": \"4711\"}. Standard headers such as From or Subject cannot be set."
        },
        attachments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              filename: { type: "string", description: "Name of the file" },
              content: { type: "string", description: "Base64 encoded file content" },
              content_type: { type: "string", description: "MIME type (e.g., 'application/pdf', 'image/png')" }
            },
            required: ["filename", "content"]
          },
          description: "Array of file attachments"
        }
      },
      required: ["to", "subject", "body"]
    }
  },

  /**
   * Reply to or forward an email
   */
  "email_respond": {
    name: "email_respond",
    description: "Reply to or forward an existing email. Use this to continue email conversations, respond to messages, or forward information to others.",
    inputSchema: {
      type: "object",
      properties: {
        account_name: {
          type: "string",
          description: "Name of the email account to use"
        },
        email_id: {
          type: "string",
          description: "ID of the email to respond to (from emails_find results)"
        },
        folder: {
          type: "string",
          default: "INBOX",
          description: "Folder the email lives in (the same folder used in emails_find). The original is flagged \\Answered (reply) or $Forwarded (forward) afterwards."
        },
        response_type: {
          type: "string",
          enum: ["reply", "reply_all", "forward"],
          default: "reply",
          description: "'reply' to sender only, 'reply_all' to all recipients, or 'forward' to new recipients"
        },
        body: {
          type: "string",
          description: "Your response message content"
        },
        body_type: {
          type: "string",
          enum: ["plain", "html"],
          default: "html",
          description: "Response body format"
        },
        to: {
          type: "array",
          items: { type: "string" },
          description: "Array of recipient emails (required for 'forward', optional for replies to override default recipients)"
        },
        include_original: {
          type: "boolean",
          default: true,
          description: "Include the original email content in your response"
        },
        include_attachments: {
          type: "boolean",
          default: true,
          description: "Include attachments from the original email"
        },
        additional_attachments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              filename: { type: "string" },
              content: { type: "string", description: "Base64 encoded" },
              content_type: { type: "string" }
            },
            required: ["filename", "content"]
          },
          description: "Additional attachments to include"
        }
      },
      required: ["email_id", "body"]
    }
  },

  /**
   * Download one attachment
   */
  "attachment_get": {
    name: "attachment_get",
    description: "Download a single attachment of an email as base64. Use the filename or part from attachment_list in emails_find results. Limited to 25 MB.",
    inputSchema: {
      type: "object",
      properties: {
        account_name: { type: "string", description: "Name of the email account to use" },
        email_id: { type: "string", description: "ID of the email (from emails_find results)" },
        folder: { type: "string", default: "INBOX", description: "Folder the email is in" },
        filename: { type: "string", description: "Attachment filename (use part instead if several share a name)" },
        part: { type: "string", description: "Attachment part id from attachment_list, e.g. '2' or '1.2'" }
      },
      required: ["email_id"]
    }
  },

  /**
   * Create a draft
   */
  "draft_create": {
    name: "draft_create",
    description: "Save an email as a draft in the Drafts folder without sending it. Recipients are optional so the draft can be finished in your mail client.",
    inputSchema: {
      type: "object",
      properties: {
        account_name: { type: "string", description: "Name of the email account to use" },
        to: { type: "array", items: { type: "string" }, description: "Array of recipient email addresses" },
        subject: { type: "string", description: "Email subject line" },
        body: { type: "string", description: "Email body content (plain text or HTML)" },
        body_type: {
          type: "string",
          enum: ["plain", "html"],
          default: "html",
          description: "Body format: 'plain' or 'html'"
        },
        from_email: {
          type: "string",
          description: "Optional sender address. When sender_emails is configured for the account, the address must be in that allowlist."
        },
        cc: { type: "array", items: { type: "string" }, description: "Array of CC recipient email addresses" },
        bcc: { type: "array", items: { type: "string" }, description: "Array of BCC recipient email addresses" },
        reply_to: {
          type: "string",
          description: "Address replies should go to (Reply-To header)"
        },
        priority: {
          type: "string",
          enum: ["high", "normal", "low"],
          description: "Message priority (X-Priority/Importance headers)"
        },
        read_receipt: {
          type: "boolean",
          description: "Ask the recipient's client for a read receipt (Disposition-Notification-To the sender)"
        },
        headers: {
          type: "object",
          additionalProperties: { type: "string" },
          description: "Custom headers as name/value pairs, e.g. {\"X-Ticket\": \"4711\"}. Standard headers such as From or Subject cannot be set."
        },
        attachments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              filename: { type: "string", description: "Name of the file" },
              content: { type: "string", description: "Base64 encoded file content" },
              content_type: { type: "string", description: "MIME type" }
            },
            required: ["filename", "content"]
          },
          description: "Array of file attachments"
        },
        folder: {
          type: "string",
          description: "Folder to store the draft in. Defaults to the folder flagged \\Drafts, else 'Drafts'."
        },
        reply_to_email_id: {
          type: "string",
          description: "Make the draft a reply to this email (ID from emails_find): fills in recipient, 'Re:' subject, threading headers and the quoted original. subject becomes optional, 'to' overrides the recipients."
        },
        reply_to_folder: {
          type: "string",
          default: "INBOX",
          description: "Folder of the email in reply_to_email_id"
        },
        reply_all: {
          type: "boolean",
          default: false,
          description: "With reply_to_email_id: address all original recipients"
        },
        include_original: {
          type: "boolean",
          default: true,
          description: "With reply_to_email_id: quote the original message below the body"
        }
      },
      required: ["body"]
    }
  },

  "draft_update": {
    name: "draft_update",
    description: "Change an existing draft. Only the fields you pass are changed; pass an empty array to clear to/cc/bcc/attachments. The draft is rewritten as a new message, so its email_id changes: use the returned email_id afterwards.",
    inputSchema: {
      type: "object",
      properties: {
        account_name: { type: "string", description: "Name of the email account to use" },
        email_id: { type: "string", description: "ID of the draft (from draft_create or emails_find with folder 'Drafts')" },
        folder: { type: "string", description: "Folder containing the draft. Defaults to the Drafts folder." },
        to: { type: "array", items: { type: "string" }, description: "New recipients" },
        cc: { type: "array", items: { type: "string" }, description: "New CC recipients" },
        bcc: { type: "array", items: { type: "string" }, description: "New BCC recipients" },
        subject: { type: "string", description: "New subject" },
        body: { type: "string", description: "New body" },
        body_type: { type: "string", enum: ["plain", "html"], description: "Format of the new body" },
        from_email: { type: "string", description: "New sender address (must be allowed for the account)" },
        reply_to: {
          type: "string",
          description: "Address replies should go to (Reply-To header)"
        },
        priority: {
          type: "string",
          enum: ["high", "normal", "low"],
          description: "Message priority (X-Priority/Importance headers)"
        },
        read_receipt: {
          type: "boolean",
          description: "Ask the recipient's client for a read receipt (Disposition-Notification-To the sender)"
        },
        headers: {
          type: "object",
          additionalProperties: { type: "string" },
          description: "Replaces all custom headers; {} removes them. Name/value pairs, e.g. {\"X-Ticket\": \"4711\"}. Standard headers such as From or Subject cannot be set."
        },
        attachments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              filename: { type: "string" },
              content: { type: "string", description: "Base64 encoded file content" },
              content_type: { type: "string" }
            },
            required: ["filename", "content"]
          },
          description: "Replaces all attachments of the draft"
        }
      },
      required: ["email_id"]
    }
  },

  "draft_send": {
    name: "draft_send",
    description: "Send an existing draft and remove it from the Drafts folder. The draft needs at least one 'to' recipient.",
    inputSchema: {
      type: "object",
      properties: {
        account_name: { type: "string", description: "Name of the email account to use" },
        email_id: { type: "string", description: "ID of the draft to send" },
        folder: { type: "string", description: "Folder containing the draft. Defaults to the Drafts folder." }
      },
      required: ["email_id"]
    }
  },

  "draft_delete": {
    name: "draft_delete",
    description: "Delete drafts. They are moved to the Trash folder unless permanent is true, which cannot be undone.",
    inputSchema: {
      type: "object",
      properties: {
        account_name: { type: "string", description: "Name of the email account to use" },
        email_ids: { type: "array", items: { type: "string" }, description: "IDs of the drafts to delete" },
        folder: { type: "string", description: "Folder containing the drafts. Defaults to the Drafts folder." },
        permanent: { type: "boolean", description: "Remove permanently instead of moving to Trash" }
      },
      required: ["email_ids"]
    }
  },

  /**
   * Create a folder
   */
  "folder_create": {
    name: "folder_create",
    description: "Create a new email folder. Use a path like 'Projects/2026' to create a subfolder (the server's folder separator is applied).",
    inputSchema: {
      type: "object",
      properties: {
        account_name: { type: "string", description: "Name of the email account to use" },
        name: { type: "string", description: "Folder name or path to create" }
      },
      required: ["name"]
    }
  },

  /**
   * Rename or move a folder
   */
  "folder_rename": {
    name: "folder_rename",
    description: "Rename a folder, or move it in the folder tree by giving a new path (e.g. 'Projects/2026' to 'Archive/2026'). Messages and subfolders stay with it. INBOX and special folders (Sent, Drafts, Trash, ...) cannot be renamed.",
    inputSchema: {
      type: "object",
      properties: {
        account_name: { type: "string", description: "Name of the email account to use" },
        name: { type: "string", description: "Current folder path (from folders_list)" },
        new_name: { type: "string", description: "New folder path" }
      },
      required: ["name", "new_name"]
    }
  },

  /**
   * Empty Trash or Junk
   */
  "folder_empty": {
    name: "folder_empty",
    description: "Permanently remove all messages from the Trash or Junk folder, optionally only those older than a number of days. Other folders cannot be emptied. Cannot be undone.",
    inputSchema: {
      type: "object",
      properties: {
        account_name: { type: "string", description: "Name of the email account to use" },
        name: { type: "string", description: "Path of the Trash or Junk folder (from folders_list)" },
        older_than_days: { type: "number", description: "Only remove messages older than this many days" }
      },
      required: ["name"]
    }
  },

  /**
   * Delete a folder
   */
  "folder_delete": {
    name: "folder_delete",
    description: "Delete an email folder and the messages in it. INBOX and special folders (Sent, Drafts, Trash, ...) are protected. Move messages elsewhere first if you want to keep them.",
    inputSchema: {
      type: "object",
      properties: {
        account_name: { type: "string", description: "Name of the email account to use" },
        name: { type: "string", description: "Folder path to delete (from folders_list)" }
      },
      required: ["name"]
    }
  },

  /**
   * List email folders
   */
  "folders_list": {
    name: "folders_list",
    description: "List all email folders with their path, parent, separator and special-use type (\\Sent, \\Drafts, \\Trash, \\Junk, ...). Use this to see the folder tree and find the right folder paths.",
    inputSchema: {
      type: "object",
      properties: {
        account_name: {
          type: "string",
          description: "Name of the email account to use"
        },
        include_counts: {
          type: "boolean",
          default: false,
          description: "Include unread and total message counts for each folder"
        }
      }
    }
  }
};
