/**
 * Email MCP Tools - Clean, simple, and flexible
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const EMAIL_TOOLS: Record<string, Tool> = {
  /**
   * Search for emails and optionally get their full content
   */
  "emails_find": {
    name: "emails_find",
    description: "Search for emails in your inbox with flexible filters. Optionally get full email content and attachments. Use this to find specific emails, check for unread messages, or browse your inbox.",
    inputSchema: {
      type: "object",
      properties: {
        account_name: {
          type: "string",
          description: "Name of the email account to use (e.g., 'work', 'personal'). If not provided, uses the default account."
        },
        query: {
          type: "string",
          description: "Natural language search query (e.g., 'unread from boss', 'project update')"
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
          description: "Maximum number of emails to return (1-100)"
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
        }
      }
    }
  },

  /**
   * Modify email states
   */
  "emails_modify": {
    name: "emails_modify",
    description: "Change email states like read/unread, flagged, or move between folders. Use this to organize your inbox, mark emails as read, archive messages, or flag important emails.",
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
          description: "Array of email IDs to modify (from emails_find results)"
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
        }
      },
      required: ["email_ids"]
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
   * List email folders
   */
  "folders_list": {
    name: "folders_list",
    description: "List all available email folders/labels in your account. Use this to see your folder structure and organize emails.",
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
