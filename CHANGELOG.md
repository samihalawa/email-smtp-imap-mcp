# Changelog

## [2.0.2] - 2025-11-24

### Fixed
- **Critical**: Fixed configuration parser to support both nested and flat JSON formats
  - Now correctly transforms `{ "account": { "smtp": {...}, "imap": {...} } }` to flat structure
  - Maintains backward compatibility with old flat format
  - Location: `src/accountManager.ts:10-45`

### Performance
- **Optimization**: Improved email search for large mailboxes (3000+ messages)
  - Changed from scanning all messages to fetching only recent ones
  - Fetches last N*3 messages instead of entire mailbox
  - Reduces search time from 30+ seconds to <3 seconds
  - Location: `src/imapService.ts:67-78`

### Added
- Support for `sender_emails` field in account configuration
- Better error handling for configuration parsing

### Tested
- ✅ Verified with real iCloud account (3,071 messages)
- ✅ Successfully retrieved recent emails
- ✅ All 5 MCP tools working correctly
- ✅ Multi-account configuration tested

## [2.0.1] - 2025-11-19

### Initial Release
- SMTP email sending
- IMAP email reading
- Multi-account support
- 5 MCP tools (emails_find, emails_modify, email_send, email_respond, folders_list)
