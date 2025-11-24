# Changelog

## [2.0.2] - 2025-11-24

### Fixed
- **Critical**: Fixed configuration parser to support both nested and flat JSON formats
  - Now correctly transforms `{ "account": { "smtp": {...}, "imap": {...} } }` to flat structure
  - Maintains backward compatibility with old flat format
  - Location: `src/accountManager.ts:10-45`

### Performance
- **Critical Fix**: Resolved 60+ second timeout issue in email fetch operations
  - Root cause: ImapFlow socket timeout during message iteration
  - Solution: Optimized fetch strategy for unfiltered searches
    - Fetch exact sequence range (last N messages) instead of search-then-fetch
    - Direct sequence number access: `(mailbox.exists - limit + 1):mailbox.exists`
    - Sort and limit results after fetching
  - Performance improvement: 65+ seconds → <10 seconds for typical operations
  - Added comprehensive timeout configuration:
    - connectionTimeout: 15s
    - greetingTimeout: 10s
    - socketTimeout: 60s
    - Operation timeout: 90s
  - Location: `src/imapService.ts:12-254`

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
