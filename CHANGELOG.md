# Changelog

## [2.2.0] - 2026-08-11

### Added
- Load multiline multi-account configuration automatically from `.env` or an explicit `EMAIL_ENV_FILE` path.
- Added `accounts_list` for discovering every configured account and the default account.
- Added protocol-level MCP tests using local SMTP and IMAP servers.

### Fixed
- Validate every account, port, secure flag, default account, and tool input before connecting.
- Apply the documented recipient override for replies and exclude the account's aliases from reply-all recipients.
- Keep the IMAP connection open until the original message is fetched for replies and forwards.
- Copy attachment arrays before adding original-message attachments.

### Changed
- Simplified the README to lead with a readable `.env` workflow and a small MCP client configuration.
- Updated the MCP server identity to `email-smtp-imap-mcp`.

## [2.1.2] - 2026-08-11

### Changed
- Published the maintained multi-account server to npm with the simple `npx -y email-smtp-imap-mcp` install path.
- Restored npm version and download badges now that the registry release matches the repository.

## [2.1.1] - 2026-08-11

### Fixed
- Replaced fragile raw-hosted WebP README artwork with repository-relative, optimized PNG assets.
- Made the quick-start command install the current tagged source release.

### Changed
- Updated the CI actions and supported Node.js versions.
- Added contribution, security, issue, pull request, and dependency-maintenance configuration.

## [2.1.0] - 2026-08-10

### Added
- Added portable text search across subject, body, sender, and recipients.
- Added sender alias selection with per-account allowlists.
- Added automated tests for account parsing, search criteria, and MCP stdio behavior.

### Fixed
- Fetch replies and forwards by the exact IMAP UID instead of checking only the newest message.
- Preserve reply-to, CC, message ID, and reference headers for correct reply-all and threading behavior.
- Apply false-valued read/flag filters, attachment filters, and real unread folder counts.
- Return MCP `isError` for failed tool calls.

### Changed
- Updated runtime dependencies and removed known production dependency advisories.
- Replaced the SMTP-only documentation with a multi-account SMTP/IMAP quick start.
- Removed Smithery-specific installation and deployment paths.

## [2.0.4] - 2026-05-20

### Changed
- Removed the legacy registry-specific config file; the package is now documented and shipped as a standard stdio MCP runnable with `npx -y email-smtp-imap-mcp`.
- Added first-class IMAP username/password support for providers that need separate IMAP credentials.
- Added env aliases for `SMTP_USERNAME`, `SMTP_PASSWORD`, `IMAP_USERNAME`, and `IMAP_PASSWORD`, plus fallback support for the pasted `MTP_SERVER` typo.

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
