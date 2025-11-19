# Email MCP Server

A clean, simple MCP server for email operations supporting both SMTP (sending) and IMAP (reading).

[![npm version](https://badge.fury.io/js/email-smtp-imap-mcp.svg)](https://www.npmjs.com/package/email-smtp-imap-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- ✅ **Send emails** with HTML and attachments
- ✅ **Search emails** with flexible filters
- ✅ **Reply/Forward** with proper threading
- ✅ **Organize** (mark read, archive, flag)
- ✅ **Multi-account support** for managing multiple email accounts
- ✅ **List folders** to browse your mailbox structure

## Quick Start

### Installation

```bash
npx -y email-smtp-imap-mcp
```

Or install globally:

```bash
npm install -g email-smtp-imap-mcp
```

### Configuration

Add to your Claude Desktop config file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "email": {
      "command": "npx",
      "args": ["-y", "email-smtp-imap-mcp"],
      "env": {
        "EMAIL_ACCOUNTS_JSON": "{\"work\":{\"smtp\":{\"host\":\"smtp.gmail.com\",\"port\":587,\"user\":\"your@gmail.com\",\"password\":\"app-password\"},\"imap\":{\"host\":\"imap.gmail.com\",\"port\":993},\"default_from_name\":\"Your Name\",\"sender_emails\":[\"your@gmail.com\"]}}",
        "DEFAULT_EMAIL_ACCOUNT": "work"
      }
    }
  }
}
```

**⚠️ Important**: Restart Claude Desktop after adding this configuration.

## Email Provider Settings

### Gmail
```json
"EMAIL_ACCOUNTS_JSON": "{\"gmail\":{\"smtp\":{\"host\":\"smtp.gmail.com\",\"port\":587,\"user\":\"your@gmail.com\",\"password\":\"app-password\"},\"imap\":{\"host\":\"imap.gmail.com\",\"port\":993},\"default_from_name\":\"Your Name\",\"sender_emails\":[\"your@gmail.com\"]}}"
```
**Setup**: [Create App Password](https://support.google.com/accounts/answer/185833)

### iCloud Mail
```json
"EMAIL_ACCOUNTS_JSON": "{\"icloud\":{\"smtp\":{\"host\":\"smtp.mail.me.com\",\"port\":587,\"user\":\"your@icloud.com\",\"password\":\"app-specific-password\"},\"imap\":{\"host\":\"imap.mail.me.com\",\"port\":993},\"default_from_name\":\"Your Name\",\"sender_emails\":[\"your@icloud.com\"]}}"
```
**Setup**: [Generate App-Specific Password](https://support.apple.com/en-us/102654)

### Outlook/Office 365
```json
"EMAIL_ACCOUNTS_JSON": "{\"outlook\":{\"smtp\":{\"host\":\"smtp-mail.outlook.com\",\"port\":587,\"user\":\"your@outlook.com\",\"password\":\"your-password\"},\"imap\":{\"host\":\"outlook.office365.com\",\"port\":993},\"default_from_name\":\"Your Name\",\"sender_emails\":[\"your@outlook.com\"]}}"
```

### Multiple Accounts
```json
"EMAIL_ACCOUNTS_JSON": "{\"work\":{\"smtp\":{\"host\":\"smtp.gmail.com\",\"port\":587,\"user\":\"work@company.com\",\"password\":\"app-password\"},\"imap\":{\"host\":\"imap.gmail.com\",\"port\":993},\"default_from_name\":\"John Doe\"},\"personal\":{\"smtp\":{\"host\":\"smtp.mail.me.com\",\"port\":587,\"user\":\"me@icloud.com\",\"password\":\"app-password\"},\"imap\":{\"host\":\"imap.mail.me.com\",\"port\":993},\"default_from_name\":\"John\"}}",
"DEFAULT_EMAIL_ACCOUNT": "work"
```

## Available Tools

| Tool | Description |
|------|-------------|
| `emails_find` | Search emails with flexible filters (sender, subject, date, attachments, etc.) |
| `emails_modify` | Mark as read/unread, flag, archive, or move emails |
| `email_send` | Send new emails with HTML content and attachments |
| `email_respond` | Reply or forward emails with proper threading |
| `folders_list` | List all available email folders |

## Usage Examples

Ask Claude to:

- "Find unread emails from last week"
- "Send an email to team@company.com about the meeting"
- "Reply to the last email from Sarah"
- "Archive all emails older than 30 days"
- "List my email folders"
- "Find emails with attachments from my boss"
- "Mark all emails from newsletter@site.com as read"

## Security Notes

- **Never commit** `.env` files or credentials to version control
- Use **app-specific passwords** or **app passwords**, not your main account password
- The server runs **locally** on your machine - credentials stay private
- All email connections use **TLS encryption** (ports 587 for SMTP, 993 for IMAP)

## Development

```bash
# Clone the repository
git clone https://github.com/samihalawa/email-smtp-imap-mcp.git
cd email-smtp-imap-mcp

# Install dependencies
npm install

# Build
npm run build

# Run locally
npm start
```

## Troubleshooting

### Authentication Errors
- Make sure you're using an **app password**, not your regular password
- For Gmail: [Create App Password](https://support.google.com/accounts/answer/185833)
- For iCloud: [Generate App-Specific Password](https://support.apple.com/en-us/102654)

### Server Not Starting
- Verify your configuration JSON is properly escaped
- Check that ports 587 (SMTP) and 993 (IMAP) are not blocked by your firewall
- Restart Claude Desktop after configuration changes

### Connection Issues
- Confirm your email provider allows IMAP/SMTP access
- Check your internet connection
- Verify the SMTP/IMAP host and port settings for your provider

## License

MIT License - see [LICENSE](LICENSE) file for details

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Author

**Sami Halawa** - [GitHub](https://github.com/samihalawa)

---

Made with ❤️ for the MCP community
