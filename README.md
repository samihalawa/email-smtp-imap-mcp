# Email MCP Server

A clean, simple MCP server for email operations (SMTP + IMAP).

## Features

- ✅ **Send emails** (HTML + attachments)
- ✅ **Search emails** (flexible filters)
- ✅ **Reply/Forward** (with threading)
- ✅ **Organize** (mark read, archive, flag)
- ✅ **List folders**

## Installation

### Option 1: NPM (Recommended)

```bash
npm install -g email-smtp-imap-mcp
```

### Option 2: From Source

```bash
git clone https://github.com/samihalawa/email-smtp-imap-mcp.git
cd email-smtp-imap-mcp
npm install
npm run build
```

## Configuration

### For Claude Desktop

**Config file locations:**
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

### Method 1: Using NPM Global Install

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "email": {
      "command": "email-mcp-server",
      "env": {
        "EMAIL_ACCOUNTS_JSON": "{\"icloud\":{\"smtp\":{\"host\":\"smtp.mail.me.com\",\"port\":587,\"user\":\"your@icloud.com\",\"password\":\"your-app-password\"},\"imap\":{\"host\":\"imap.mail.me.com\",\"port\":993},\"default_from_name\":\"Your Name\",\"sender_emails\":[\"your@icloud.com\"]}}",
        "DEFAULT_EMAIL_ACCOUNT": "icloud"
      }
    }
  }
}
```

### Method 2: Using Local Build

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "email": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/email-smtp-imap-mcp/build/index.js"],
      "env": {
        "EMAIL_ACCOUNTS_JSON": "{\"icloud\":{\"smtp\":{\"host\":\"smtp.mail.me.com\",\"port\":587,\"user\":\"your@icloud.com\",\"password\":\"your-app-password\"},\"imap\":{\"host\":\"imap.mail.me.com\",\"port\":993},\"default_from_name\":\"Your Name\",\"sender_emails\":[\"your@icloud.com\"]}}",
        "DEFAULT_EMAIL_ACCOUNT": "icloud"
      }
    }
  }
}
```

**Replace `/ABSOLUTE/PATH/TO/email-smtp-imap-mcp` with your actual path.**

### Method 3: Using .env File (Cleaner)

1. Create `.env` file in your home directory or project:

```env
EMAIL_ACCOUNTS_JSON={"icloud":{"smtp":{"host":"smtp.mail.me.com","port":587,"user":"your@icloud.com","password":"your-app-password"},"imap":{"host":"imap.mail.me.com","port":993},"default_from_name":"Your Name","sender_emails":["your@icloud.com","alias@domain.com"]}}
DEFAULT_EMAIL_ACCOUNT=icloud
```

2. Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "email": {
      "command": "email-mcp-server"
    }
  }
}
```

**The server will automatically load from `.env` file.**

---

**⚠️ Important**: Restart Claude Desktop after configuration changes.

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
