# Email MCP Server - Quick Reference

## Configuration

```bash
# .env
EMAIL_ACCOUNTS_JSON='{"work":{"smtp_host":"smtp.gmail.com","smtp_port":587,"smtp_secure":false,"smtp_user":"you@gmail.com","smtp_pass":"app-password","imap_host":"imap.gmail.com","imap_port":993,"imap_secure":true}}'
```

## 5 Core Tools

### 1. emails_find
**Purpose:** Search and read emails

**Common Patterns:**
```json
// Find unread emails
{"filters": {"is_unread": true}}

// Find emails from specific sender
{"filters": {"from": "boss@company.com"}}

// Find with full content
{"filters": {"is_unread": true}, "include_content": true}

// Find with attachments
{"filters": {"has_attachments": true}, "include_attachments": true}

// Date range
{"filters": {"after_date": "2024-01-01", "before_date": "2024-12-31"}}
```

### 2. emails_modify
**Purpose:** Change email states

**Common Patterns:**
```json
// Mark as read
{"email_ids": ["123"], "mark_read": true}

// Flag as important
{"email_ids": ["123"], "flag": true}

// Archive
{"email_ids": ["123"], "move_to_folder": "Archive"}

// Batch operations
{"email_ids": ["1","2","3"], "mark_read": true, "move_to_folder": "Archive"}
```

### 3. email_send
**Purpose:** Send new emails

**Common Patterns:**
```json
// Simple email
{"to": ["user@example.com"], "subject": "Hello", "body": "Message"}

// HTML email
{"to": ["user@example.com"], "subject": "Update", "body": "<h1>News</h1>", "body_type": "html"}

// With attachment
{
  "to": ["user@example.com"],
  "subject": "Report",
  "body": "See attached",
  "attachments": [{
    "filename": "report.pdf",
    "content": "base64content...",
    "content_type": "application/pdf"
  }]
}

// With CC/BCC
{"to": ["user@example.com"], "cc": ["team@company.com"], "bcc": ["boss@company.com"], "subject": "...", "body": "..."}
```

### 4. email_respond
**Purpose:** Reply or forward emails

**Common Patterns:**
```json
// Simple reply
{"email_id": "123", "body": "Thanks!"}

// Reply all
{"email_id": "123", "response_type": "reply_all", "body": "Thanks everyone!"}

// Forward
{"email_id": "123", "response_type": "forward", "to": ["team@company.com"], "body": "FYI"}

// Reply without original
{"email_id": "123", "body": "Thanks", "include_original": false}

// Reply with new attachment
{
  "email_id": "123",
  "body": "Here's the file",
  "additional_attachments": [{
    "filename": "data.xlsx",
    "content": "base64...",
    "content_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  }]
}
```

### 5. folders_list
**Purpose:** List email folders

**Common Patterns:**
```json
// List folders
{}

// List with counts
{"include_counts": true}
```

## Common Workflows

### Inbox Zero
```
1. emails_find → filters.is_unread=true
2. For each email:
   - email_respond if needed
   - emails_modify → mark_read + move_to_folder
```

### Project Update
```
1. email_send → to=team, subject="Update", body=HTML
2. Done!
```

### Forward Important Email
```
1. emails_find → find the email
2. email_respond → response_type="forward", to=manager
```

### Clean Up Old Emails
```
1. emails_find → filters.before_date="2024-01-01"
2. emails_modify → move_to_folder="Archive"
```

## Common Filters

```json
{
  "from": "sender@example.com",      // From specific sender
  "to": "recipient@example.com",     // To specific recipient
  "subject": "keyword",              // Subject contains
  "has_attachments": true,           // Has attachments
  "is_unread": true,                 // Unread only
  "is_flagged": true,                // Flagged/starred
  "after_date": "2024-01-01",        // After date
  "before_date": "2024-12-31"        // Before date
}
```

## Common Folders

```
INBOX           # Main inbox
Archive         # Archived emails
Sent            # Sent emails
Drafts          # Draft emails
Trash           # Deleted emails
Spam            # Spam/junk
[Gmail]/All     # Gmail: all mail
[Gmail]/Starred # Gmail: starred
```

## MIME Types (Attachments)

```
application/pdf                     # PDF
image/png                           # PNG image
image/jpeg                          # JPEG image
text/plain                          # Plain text
text/csv                            # CSV file
application/zip                     # ZIP archive
application/vnd.ms-excel            # Excel (.xls)
application/vnd.openxmlformats-...  # Excel (.xlsx)
application/msword                  # Word (.doc)
application/vnd.openxmlformats-...  # Word (.docx)
```

## Error Handling

```json
// Check the response for errors
{
  "success": false,
  "error": "Authentication failed"
}
```

**Common Errors:**
- "Account not found" → Check account_name
- "Authentication failed" → Check SMTP/IMAP credentials
- "Email not found" → Check email_id
- "Connection timeout" → Check network/firewall

## Provider Settings

### Gmail
```json
{
  "smtp_host": "smtp.gmail.com",
  "smtp_port": 587,
  "smtp_secure": false,
  "imap_host": "imap.gmail.com",
  "imap_port": 993,
  "imap_secure": true
}
```
**Note:** Use App-Specific Password, not regular password

### iCloud
```json
{
  "smtp_host": "smtp.mail.me.com",
  "smtp_port": 587,
  "smtp_secure": false,
  "imap_host": "imap.mail.me.com",
  "imap_port": 993,
  "imap_secure": true
}
```
**Note:** Use App-Specific Password

### Outlook/Office 365
```json
{
  "smtp_host": "smtp.office365.com",
  "smtp_port": 587,
  "smtp_secure": false,
  "imap_host": "outlook.office365.com",
  "imap_port": 993,
  "imap_secure": true
}
```

## Tips & Tricks

### Multiple Operations
Call tools sequentially, don't try to batch in one call.

### HTML Emails
Always use `body_type: "html"` for rich formatting.

### Large Attachments
Base64 encode before sending. Consider file size limits.

### Rate Limiting
For bulk operations, add delays between calls (LLM handles this).

### Search Optimization
Use specific filters to narrow results before retrieving content.

### Folder Names
Use exact folder names (case-sensitive). Use folders_list to see available folders.

## Build & Run

```bash
# Install
npm install

# Build
npm run build

# Add to Claude Desktop config
# Edit ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "email": {
      "command": "node",
      "args": ["/path/to/build/index.js"],
      "env": {
        "EMAIL_ACCOUNTS_JSON": "..."
      }
    }
  }
}
```

## Documentation

- **DESIGN.md** - Complete design documentation
- **README.md** - Getting started guide
- **MIGRATION.md** - v1 to v2 migration guide
- **SUMMARY.md** - Project summary
- **.env.example** - Configuration template

---

**Version:** 2.0.0  
**License:** MIT  
**Author:** Sami Halawa
