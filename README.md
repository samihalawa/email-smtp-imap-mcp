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

Add to your `claude_desktop_config.json`:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "email": {
      "command": "npx",
      "args": ["-y", "email-smtp-imap-mcp"],
      "env": {
        "EMAIL_ACCOUNTS_JSON": "{\"icloud\":{\"smtp\":{\"host\":\"smtp.mail.me.com\",\"port\":587,\"user\":\"your@icloud.com\",\"password\":\"your-app-password\"},\"imap\":{\"host\":\"imap.mail.me.com\",\"port\":993},\"default_from_name\":\"Your Name\",\"sender_emails\":[\"your@icloud.com\",\"alias@domain.com\"]}}",
        "DEFAULT_EMAIL_ACCOUNT": "icloud"
      }
    }
  }
}
```

**Replace** `your@icloud.com`, `your-app-password`, and `Your Name` with your actual credentials.

### Email Provider Settings

<details>
<summary>📧 iCloud Mail</summary>

```json
"EMAIL_ACCOUNTS_JSON": "{\"icloud\":{\"smtp\":{\"host\":\"smtp.mail.me.com\",\"port\":587,\"user\":\"your@icloud.com\",\"password\":\"app-specific-password\"},\"imap\":{\"host\":\"imap.mail.me.com\",\"port\":993},\"default_from_name\":\"Your Name\",\"sender_emails\":[\"your@icloud.com\"]}}"
```

**Note**: Use [app-specific password](https://support.apple.com/en-us/102654), not your iCloud password.
</details>

<details>
<summary>📧 Gmail</summary>

```json
"EMAIL_ACCOUNTS_JSON": "{\"gmail\":{\"smtp\":{\"host\":\"smtp.gmail.com\",\"port\":587,\"user\":\"your@gmail.com\",\"password\":\"app-password\"},\"imap\":{\"host\":\"imap.gmail.com\",\"port\":993},\"default_from_name\":\"Your Name\",\"sender_emails\":[\"your@gmail.com\"]}}"
```

**Note**: Use [app password](https://support.google.com/accounts/answer/185833), not your Google password.
</details>

<details>
<summary>📧 Outlook/Office 365</summary>

```json
"EMAIL_ACCOUNTS_JSON": "{\"outlook\":{\"smtp\":{\"host\":\"smtp-mail.outlook.com\",\"port\":587,\"user\":\"your@outlook.com\",\"password\":\"your-password\"},\"imap\":{\"host\":\"outlook.office365.com\",\"port\":993},\"default_from_name\":\"Your Name\",\"sender_emails\":[\"your@outlook.com\"]}}"
```
</details>

---

**⚠️ Important**: Restart Claude Desktop after adding configuration.

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
