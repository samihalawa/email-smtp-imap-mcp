import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { sendEmail, sendBulkEmails, EmailRecipient } from "./emailService.js";
import { 
  getSmtpConfigs, 
  saveSmtpConfigs, 
  getEmailTemplates, 
  saveEmailTemplate, 
  deleteEmailTemplate,
  SmtpServerConfig,
  EmailTemplate,
  getEmailLogs,
  EmailLogEntry
} from "./config.js";

/**
 * Create tool definitions
 */
export function createToolDefinitions(): Record<string, Tool> {
  return {
    "send-email": {
      name: "send-email",
      description: "Send an email to one or more recipients",
      inputSchema: {
        type: "object",
        properties: {
          to: {
            type: "array",
            items: {
              type: "object",
              properties: {
                email: { type: "string" },
                name: { type: "string" }
              },
              required: ["email"]
            },
            description: "Array of recipients"
          },
          subject: {
            type: "string",
            description: "Email subject"
          },
          body: {
            type: "string",
            description: "Email body (HTML supported)"
          },
          from: {
            type: "object",
            properties: {
              email: { type: "string" },
              name: { type: "string" }
            },
            description: "Sender information. If not provided, the default SMTP user will be used."
          },
          cc: {
            type: "array",
            items: {
              type: "object",
              properties: {
                email: { type: "string" },
                name: { type: "string" }
              },
              required: ["email"]
            },
            description: "Array of CC recipients"
          },
          bcc: {
            type: "array",
            items: {
              type: "object",
              properties: {
                email: { type: "string" },
                name: { type: "string" }
              },
              required: ["email"]
            },
            description: "Array of BCC recipients"
          },
          templateId: {
            type: "string",
            description: "ID of the email template to use. If not provided, the email will use the subject and body provided."
          },
          templateData: {
            type: "object",
            description: "Data to be used for template variable substitution"
          },
          smtpConfigId: {
            type: "string",
            description: "ID of the SMTP configuration to use. If not provided, the default configuration will be used."
          }
        },
        required: ["to", "subject", "body"]
      }
    },
    
    "send-bulk-emails": {
      name: "send-bulk-emails",
      description: "Send emails in bulk to multiple recipients with rate limiting",
      inputSchema: {
        type: "object",
        properties: {
          recipients: {
            type: "array",
            items: {
              type: "object",
              properties: {
                email: { type: "string" },
                name: { type: "string" }
              },
              required: ["email"]
            },
            description: "Array of recipients"
          },
          subject: {
            type: "string",
            description: "Email subject"
          },
          body: {
            type: "string",
            description: "Email body (HTML supported)"
          },
          from: {
            type: "object",
            properties: {
              email: { type: "string" },
              name: { type: "string" }
            },
            description: "Sender information. If not provided, the default SMTP user will be used."
          },
          cc: {
            type: "array",
            items: {
              type: "object",
              properties: {
                email: { type: "string" },
                name: { type: "string" }
              },
              required: ["email"]
            },
            description: "Array of CC recipients"
          },
          bcc: {
            type: "array",
            items: {
              type: "object",
              properties: {
                email: { type: "string" },
                name: { type: "string" }
              },
              required: ["email"]
            },
            description: "Array of BCC recipients"
          },
          templateId: {
            type: "string",
            description: "ID of the email template to use. If not provided, the email will use the subject and body provided."
          },
          templateData: {
            type: "object",
            description: "Data to be used for template variable substitution"
          },
          batchSize: {
            type: "number",
            description: "Number of emails to send in each batch (default: 10)"
          },
          delayBetweenBatches: {
            type: "number",
            description: "Delay between batches in milliseconds (default: 1000)"
          },
          smtpConfigId: {
            type: "string",
            description: "ID of the SMTP configuration to use. If not provided, the default configuration will be used."
          }
        },
        required: ["recipients", "subject", "body"]
      }
    },
    
    "get-smtp-configs": {
      name: "get-smtp-configs",
      description: "Get all SMTP configurations",
      inputSchema: {
        type: "object",
        properties: {},
        required: []
      }
    },
    
    "add-smtp-config": {
      name: "add-smtp-config",
      description: "Add a new SMTP configuration",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Name of the SMTP configuration"
          },
          host: {
            type: "string",
            description: "SMTP host"
          },
          port: {
            type: "number",
            description: "SMTP port"
          },
          secure: {
            type: "boolean",
            description: "Whether to use secure connection (SSL/TLS)"
          },
          user: {
            type: "string",
            description: "SMTP username"
          },
          pass: {
            type: "string",
            description: "SMTP password"
          },
          isDefault: {
            type: "boolean",
            description: "Whether this configuration should be the default"
          }
        },
        required: ["name", "host", "port", "user", "pass"]
      }
    },
    
    "update-smtp-config": {
      name: "update-smtp-config",
      description: "Update an existing SMTP configuration",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "ID of the SMTP configuration to update"
          },
          name: {
            type: "string",
            description: "Name of the SMTP configuration"
          },
          host: {
            type: "string",
            description: "SMTP host"
          },
          port: {
            type: "number",
            description: "SMTP port"
          },
          secure: {
            type: "boolean",
            description: "Whether to use secure connection (SSL/TLS)"
          },
          user: {
            type: "string",
            description: "SMTP username"
          },
          pass: {
            type: "string",
            description: "SMTP password"
          },
          isDefault: {
            type: "boolean",
            description: "Whether this configuration should be the default"
          }
        },
        required: ["id"]
      }
    },
    
    "delete-smtp-config": {
      name: "delete-smtp-config",
      description: "Delete an SMTP configuration",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "ID of the SMTP configuration to delete"
          }
        },
        required: ["id"]
      }
    },
    
    "get-email-templates": {
      name: "get-email-templates",
      description: "Get all email templates",
      inputSchema: {
        type: "object",
        properties: {},
        required: []
      }
    },
    
    "add-email-template": {
      name: "add-email-template",
      description: "Add a new email template",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Name of the template"
          },
          subject: {
            type: "string",
            description: "Email subject template"
          },
          body: {
            type: "string",
            description: "Email body template"
          },
          isDefault: {
            type: "boolean",
            description: "Whether this template should be the default"
          }
        },
        required: ["name", "subject", "body"]
      }
    },
    
    "update-email-template": {
      name: "update-email-template",
      description: "Update an existing email template",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "ID of the template to update"
          },
          name: {
            type: "string",
            description: "Name of the template"
          },
          subject: {
            type: "string",
            description: "Email subject template"
          },
          body: {
            type: "string",
            description: "Email body template"
          },
          isDefault: {
            type: "boolean",
            description: "Whether this template should be the default"
          }
        },
        required: ["id"]
      }
    },
    
    "delete-email-template": {
      name: "delete-email-template",
      description: "Delete an email template",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "ID of the template to delete"
          }
        },
        required: ["id"]
      }
    },
    
    "get-email-logs": {
      name: "get-email-logs",
      description: "Get logs of all email sending activity",
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum number of log entries to return (most recent first)"
          },
          filterBySuccess: {
            type: "boolean",
            description: "Filter logs by success status (true = successful emails, false = failed emails)"
          }
        }
      }
    }
  };
} 