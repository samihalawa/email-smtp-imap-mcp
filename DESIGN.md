# EMAIL MCP SERVER - CLEAN DESIGN

## Core Principles
- **No bullshit complexity** - Just actual email operations
- **Simple, clear tools** - Each tool does one obvious thing
- **Flexible parameters** - Support multiple workflows
- **LLM-friendly** - Natural parameters and descriptions
- **Both SMTP and IMAP** - Send AND receive emails

## Tool Set (5 Core Tools)

### 1. emails_find
Search for emails and optionally get their full content.

**Parameters:**
- `account_name`: Email account to use (from ENV config)
- `query`: Natural language search (e.g., "unread from boss")
- `filters`: Object with structured filters
  - `from`: Sender email address
  - `to`: Recipient email address
  - `subject`: Subject line text
  - `has_attachments`: Boolean
  - `is_unread`: Boolean
  - `is_flagged`: Boolean
  - `after_date`: ISO date string
  - `before_date`: ISO date string
- `limit`: Max results (1-100, default 20)
- `include_content`: Get full email bodies (default false)
- `include_attachments`: Get attachment content (default false)

**Returns:** Array of emails with requested fields

**Usage:**
```json
{
  "account_name": "work",
  "filters": {"is_unread": true, "from": "boss@company.com"},
  "include_content": true,
  "limit": 10
}
```

### 2. emails_modify
Change email states (read/unread, flagged, move between folders).

**Parameters:**
- `account_name`: Email account to use
- `email_ids`: Array of email IDs to modify
- `mark_read`: Boolean (optional)
- `mark_unread`: Boolean (optional)
- `flag`: Boolean (optional)
- `unflag`: Boolean (optional)
- `move_to_folder`: Folder name like "Archive", "Trash", "INBOX" (optional)

**Returns:** Success status for each email

**Usage:**
```json
{
  "account_name": "work",
  "email_ids": ["msg123", "msg456"],
  "mark_read": true,
  "move_to_folder": "Archive"
}
```

### 3. email_send
Send a new email with HTML support and attachments.

**Parameters:**
- `account_name`: Email account to use
- `to`: Array of recipient emails
- `subject`: Email subject
- `body`: Email body (HTML or plain text)
- `body_type`: "plain" or "html" (default "html")
- `cc`: Array of CC recipients (optional)
- `bcc`: Array of BCC recipients (optional)
- `attachments`: Array of attachment objects (optional)
  - `filename`: String
  - `content`: Base64 encoded content
  - `content_type`: MIME type

**Returns:** Message ID and send status

**Usage:**
```json
{
  "account_name": "work",
  "to": ["team@company.com"],
  "subject": "Project Update",
  "body": "<h1>Status</h1><p>On track!</p>",
  "body_type": "html",
  "attachments": [{
    "filename": "report.pdf",
    "content": "base64content...",
    "content_type": "application/pdf"
  }]
}
```

### 4. email_respond
Reply to or forward an existing email.

**Parameters:**
- `account_name`: Email account to use
- `email_id`: ID of email to respond to
- `response_type`: "reply", "reply_all", or "forward" (default "reply")
- `body`: Your response content
- `body_type`: "plain" or "html" (default "html")
- `to`: Array of recipients (required for forward, optional for reply)
- `include_original`: Include original email in response (default true)
- `include_attachments`: Include original attachments (default true)
- `additional_attachments`: Array of new attachments (optional)

**Returns:** Message ID and send status

**Usage:**
```json
{
  "account_name": "work",
  "email_id": "msg123",
  "response_type": "reply",
  "body": "<p>Thanks for the update!</p>",
  "body_type": "html"
}
```

### 5. folders_list
List available email folders.

**Parameters:**
- `account_name`: Email account to use
- `include_counts`: Include unread counts (default false)

**Returns:** Array of folders with names and optionally counts

**Usage:**
```json
{
  "account_name": "work",
  "include_counts": true
}
```

## Configuration via ENV

**REQUIRED:**
```bash
# Email accounts configuration (JSON)
EMAIL_ACCOUNTS_JSON='{
  "work": {
    "smtp_host": "smtp.mail.me.com",
    "smtp_port": 587,
    "smtp_secure": false,
    "smtp_user": "user@example.com",
    "smtp_pass": "password",
    "imap_host": "imap.mail.me.com",
    "imap_port": 993,
    "imap_secure": true,
    "default_from_name": "Your Name"
  },
  "personal": {
    "smtp_host": "smtp.gmail.com",
    "smtp_port": 587,
    "smtp_secure": false,
    "smtp_user": "personal@gmail.com",
    "smtp_pass": "app-password",
    "imap_host": "imap.gmail.com",
    "imap_port": 993,
    "imap_secure": true,
    "default_from_name": "Your Name"
  }
}'

# Default account if not specified in tool call
DEFAULT_EMAIL_ACCOUNT="work"
```

**ALTERNATIVE (for single account):**
```bash
SMTP_HOST="smtp.mail.me.com"
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER="user@example.com"
SMTP_PASS="password"
IMAP_HOST="imap.mail.me.com"
IMAP_PORT=993
IMAP_SECURE=true
DEFAULT_FROM_NAME="Your Name"
```

## Real-World Usage Patterns

### Pattern 1: Process Unread Emails
```json
// Find unread emails
{"tool": "emails_find", "parameters": {
  "account_name": "work",
  "filters": {"is_unread": true},
  "include_content": true
}}

// Reply to one
{"tool": "email_respond", "parameters": {
  "account_name": "work",
  "email_id": "msg123",
  "body": "Got it, thanks!"
}}

// Mark as read
{"tool": "emails_modify", "parameters": {
  "account_name": "work",
  "email_ids": ["msg123"],
  "mark_read": true
}}
```

### Pattern 2: Send Project Update
```json
{"tool": "email_send", "parameters": {
  "account_name": "work",
  "to": ["team@company.com"],
  "subject": "Project Update",
  "body": "<h1>Status Report</h1><p><strong>On track</strong> for Friday.</p>",
  "body_type": "html"
}}
```

### Pattern 3: Forward Important Email
```json
{"tool": "email_respond", "parameters": {
  "account_name": "work",
  "email_id": "msg123",
  "response_type": "forward",
  "to": ["manager@company.com"],
  "body": "Thought you should see this"
}}
```

### Pattern 4: Batch Archive Old Emails
```json
// Find old emails
{"tool": "emails_find", "parameters": {
  "account_name": "work",
  "query": "project-alpha",
  "filters": {"before_date": "2024-01-01"},
  "limit": 100
}}

// Archive them all
{"tool": "emails_modify", "parameters": {
  "account_name": "work",
  "email_ids": ["msg1", "msg2", "msg3"],
  "move_to_folder": "Archive"
}}
```

## Why This Design Works

✅ **Covers All Email Basics:**
- Find emails (search + get content)
- Read emails (full content with HTML)
- Send emails (new, reply, forward)
- Manage emails (read/unread, flag, move)
- Attachments (send and receive)
- Folders (organization)

✅ **No Bullshit:**
- No analytics dashboards
- No workflow engines
- No AI magic
- No over-engineering

✅ **LLM-Friendly:**
- Natural parameter names
- Clear tool purposes
- Flexible but simple
- HTML support that just works

✅ **Real Email Protocols:**
- Actual SMTP/IMAP operations
- Proper MIME handling
- Email threading
- Attachment support

## Implementation Notes

1. **Connection Management:**
   - Open IMAP connection per request (stateless)
   - Use connection pooling if performance issues
   - Close connections after each operation

2. **Error Handling:**
   - Clear, actionable error messages
   - Graceful degradation
   - Authentication errors
   - Rate limiting awareness

3. **Security:**
   - Passwords in ENV only
   - No logging of sensitive data
   - Secure SMTP/IMAP connections
   - Validate all inputs

4. **Performance:**
   - Cache folder lists
   - Limit search results
   - Efficient IMAP queries
   - Stream large attachments
