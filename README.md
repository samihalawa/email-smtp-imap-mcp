# Email MCP Server

A clean, simple MCP server for email operations (SMTP + IMAP).

## Features

- ✅ **Send emails** (HTML + attachments)
- ✅ **Search emails** (flexible filters)
- ✅ **Reply/Forward** (with threading)
- ✅ **Organize** (mark read, archive, flag)
- ✅ **List folders**

## Quick Start

### 1. Install

```bash
npm install
npm run build
```

### 2. Configure

Create `.env`:

```env
EMAIL_ACCOUNTS_JSON={"icloud":{"smtp":{"host":"smtp.mail.me.com","port":587,"user":"your@icloud.com","password":"your-app-password"},"imap":{"host":"imap.mail.me.com","port":993},"default_from_name":"Your Name","sender_emails":["your@icloud.com","alias@domain.com"]}}
DEFAULT_EMAIL_ACCOUNT=icloud
```

### 3. Add to MCP-Supported Software

#### Claude Desktop

Add to your `claude_desktop_config.json`:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "email": {
      "command": "node",
      "args": ["/absolute/path/to/email-smtp-imap-mcp/build/index.js"],
      "env": {
        "EMAIL_ACCOUNTS_JSON": "{\"icloud\":{\"smtp\":{\"host\":\"smtp.mail.me.com\",\"port\":587,\"user\":\"your@icloud.com\",\"password\":\"your-app-password\"},\"imap\":{\"host\":\"imap.mail.me.com\",\"port\":993},\"default_from_name\":\"Your Name\",\"sender_emails\":[\"your@icloud.com\"]}}",
        "DEFAULT_EMAIL_ACCOUNT": "icloud"
      }
    }
  }
}
```

**Note**: Replace `/absolute/path/to/email-smtp-imap-mcp` with your actual installation path. You can also use a `.env` file instead of inline env config.

Restart Claude Desktop to load the MCP server.

## 5 Tools

| Tool | Purpose |
|------|---------|
| `emails_find` | Search emails with filters |
| `emails_modify` | Mark read, archive, flag |
| `email_send` | Send new emails |
| `email_respond` | Reply or forward |
| `folders_list` | List folders |

## Usage Examples

```
"Find unread emails from last week"
"Send an email to team@company.com"
"Reply to the last email from John"
"Archive all emails older than 30 days"
"List my email folders"
```

## Documentation

- **QUICK_REFERENCE.md** - Command examples
- **DESIGN.md** - Architecture details
- **SETUP_COMPLETE.md** - Full setup guide

## License

MIT
