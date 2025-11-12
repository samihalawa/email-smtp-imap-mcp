# SMTP Email MCP Server

A Model Context Protocol (MCP) server that provides email sending capabilities for Claude and other MCP-compatible AI assistants.

## Features

- **Multiple SMTP Configurations**: Configure and manage multiple SMTP servers
- **Email Templates**: Create, update, and use reusable email templates
- **Bulk Email Sending**: Send emails to multiple recipients with batching and rate limiting
- **HTML Support**: Full HTML support for rich email content
- **Logging**: Comprehensive logging of all email activities
- **Template Variables**: Dynamic content using template variables

## Installation

```bash
# Clone the repository
git clone https://github.com/samihalawa/mcp-server-smtp.git
cd mcp-server-smtp

# Install dependencies
npm install

# Build the server
npm run build
```

## Usage

### Starting the Server

```bash
npm start
```

### Configuration

Add the server to your MCP configuration:

```json
{
  "servers": {
    "smtp-email-server": {
      "command": "/path/to/node",
      "args": ["/path/to/mcp-server-smtp/build/index.js"],
      "enabled": true,
      "port": 3007,
      "environment": {
        "NODE_PATH": "/path/to/node_modules",
        "PATH": "/usr/local/bin:/usr/bin:/bin"
      }
    }
  }
}
```

### Available Tools

#### send-email

Send an email to one or more recipients.

Parameters:
- `to`: Array of recipients with email and optional name
- `subject`: Email subject
- `body`: Email body (HTML supported)
- `from`: (Optional) Sender email and name
- `cc`: (Optional) CC recipients
- `bcc`: (Optional) BCC recipients
- `templateId`: (Optional) ID of a template to use
- `templateData`: (Optional) Data to populate template variables
- `smtpConfigId`: (Optional) ID of the SMTP configuration to use

#### send-bulk-emails

Send emails to multiple recipients in batches.

Parameters:
- `recipients`: Array of recipients with email and optional name
- `subject`: Email subject
- `body`: Email body (HTML supported)
- `from`: (Optional) Sender email and name
- `cc`: (Optional) CC recipients
- `bcc`: (Optional) BCC recipients
- `templateId`: (Optional) ID of a template to use
- `templateData`: (Optional) Data to populate template variables
- `batchSize`: (Optional) Number of emails to send in each batch
- `delayBetweenBatches`: (Optional) Delay in milliseconds between batches
- `smtpConfigId`: (Optional) ID of the SMTP configuration to use

#### get-smtp-configs

Get all configured SMTP servers.

Parameters: None

#### add-smtp-config

Add a new SMTP server configuration.

Parameters:
- `name`: Name for the configuration
- `host`: SMTP server hostname
- `port`: SMTP server port
- `secure`: Whether to use SSL/TLS
- `auth`: Authentication credentials (user and pass)
- `isDefault`: (Optional) Whether this is the default configuration

#### update-smtp-config

Update an existing SMTP server configuration.

Parameters:
- `id`: ID of the configuration to update
- `name`: Name for the configuration
- `host`: SMTP server hostname
- `port`: SMTP server port
- `secure`: Whether to use SSL/TLS
- `auth`: Authentication credentials (user and pass)
- `isDefault`: (Optional) Whether this is the default configuration

#### delete-smtp-config

Delete an SMTP server configuration.

Parameters:
- `id`: ID of the configuration to delete

#### get-email-templates

Get all email templates.

Parameters: None

#### add-email-template

Add a new email template.

Parameters:
- `name`: Template name
- `subject`: Email subject template
- `body`: Email body template (HTML supported)
- `isDefault`: (Optional) Whether this is the default template

#### update-email-template

Update an existing email template.

Parameters:
- `id`: ID of the template to update
- `name`: Template name
- `subject`: Email subject template
- `body`: Email body template (HTML supported)
- `isDefault`: (Optional) Whether this is the default template

#### delete-email-template

Delete an email template.

Parameters:
- `id`: ID of the template to delete

#### get-email-logs

Get logs of sent emails.

Parameters: None

## Example Usage

1. Configure an SMTP server:
   ```
   add-smtp-config(
     name: "Gmail",
     host: "smtp.gmail.com",
     port: 587,
     secure: false,
     auth: {
       user: "your-email@gmail.com",
       pass: "your-app-password"
     },
     isDefault: true
   )
   ```

2. Create an email template:
   ```
   add-email-template(
     name: "Welcome Email",
     subject: "Welcome to {{company}}!",
     body: "<h1>Hello {{name}},</h1><p>Welcome to {{company}}!</p>",
     isDefault: false
   )
   ```

3. Send an email using a template:
   ```
   send-email(
     to: [{ email: "recipient@example.com", name: "John Doe" }],
     templateId: "welcome-email",
     templateData: {
       name: "John",
       company: "ACME Corp"
     }
   )
   ```

4. Send bulk emails:
   ```
   send-bulk-emails(
     recipients: [
       { email: "user1@example.com", name: "User 1" },
       { email: "user2@example.com", name: "User 2" }
     ],
     subject: "Important Announcement",
     body: "<p>This is an important announcement.</p>",
     batchSize: 10,
     delayBetweenBatches: 1000
   )
   ```

## Requirements

- Node.js 14+
- Nodemailer for email sending
- Access to an SMTP server

## License

MIT 