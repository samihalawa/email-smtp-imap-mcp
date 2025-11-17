# Email MCP Server - Summary

Clean, simple MCP server for email operations (SMTP + IMAP).

## What It Does

5 tools for complete email management:
1. **emails_find** - Search with filters
2. **emails_modify** - Mark read, archive, flag
3. **email_send** - Send HTML + attachments
4. **email_respond** - Reply/forward with threading
5. **folders_list** - List folders

## Setup

```bash
npm install
npm run build
# Create .env with credentials
# Add to Claude Desktop config
```

## Files

**Source (`src/`):**
- `index.ts` - MCP server
- `accountManager.ts` - Account config
- `emailTools.ts` - Tool definitions
- `emailHandlers.ts` - Tool logic
- `smtpService.ts` - SMTP sending
- `imapService.ts` - IMAP reading
- `types.ts` - TypeScript types

**Docs:**
- `README.md` - Quick start
- `DESIGN.md` - Architecture
- `QUICK_REFERENCE.md` - Examples
- `SETUP_COMPLETE.md` - Full setup

## Status

✅ **Production Ready v2.0**
- Built with TypeScript
- Uses official MCP SDK
- Clean, maintainable code
- Tested with iCloud
- All tools working
