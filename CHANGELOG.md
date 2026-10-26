# Changelog

## [Unreleased]

### Added
- `emails_wait` waits for new mail (IMAP IDLE) and returns it, so a reply can be awaited without repeated searches.
- IMAP connections are reused for 30 seconds (`IMAP_KEEPALIVE_SECONDS`, `0` disables), which makes multi-step workflows much faster and avoids provider login limits.
- `email_send`, `draft_create` and `draft_update` accept `reply_to`, `priority`, `read_receipt` and custom `headers`; drafts keep them across updates and `draft_send`.
- Custom keywords: `emails_modify` can `add_keywords`/`remove_keywords`, `emails_find` filters with `keyword`/`no_keyword` and lists `keywords`.
- `emails_find` pages with `offset` and `order` and reports `total_found`, `has_more` and `next_offset`; new filters `is_answered`, `is_forwarded`, `is_draft`, `cc`, `bcc`, `min_size` and `max_size`.
- `emails_modify` can act on search results (`filters`/`query`) with a `dry_run` and a required `expected_count`, and can report mail as spam (`mark_spam`/`mark_not_spam`).
- `folder_empty` clears the Trash or Junk folder.
- `folder_rename` renames or moves folders; `emails_modify` can copy messages with `copy_to_folder`; `folders_list` reports parent, separator and special-use type.

### Fixed
- Sent, Drafts and Trash are also found by common German and English names when the server sets no special-use flags.
- Moving, copying or deleting to a folder the server refuses (for example one that does not exist) is now reported as an error instead of counted as modified.
- `attachment_get` downloads a single attachment; `emails_find` results list attachments in `attachment_list` without downloading them.
- `draft_update`, `draft_send` and `draft_delete` complete the draft workflow; `draft_create` can answer an existing message with `reply_to_email_id`.
- `email_respond` accepts a `folder` and flags the original `\Answered` (reply) or `$Forwarded` (forward); the result reports `original_flagged`.
- Per-account safety switches `READ_ONLY`, `ALLOW_DELETE` and `ALLOW_PERMANENT_DELETE`; `accounts_list` reports them.
- `draft_create` saves drafts to the IMAP Drafts folder without sending.
- `folder_create` and `folder_delete` manage folders (INBOX and special-use folders are protected).
- `emails_modify` can delete messages (to Trash, or permanently with `permanent: true`) and accepts a source `folder`.
- `emails_find` accepts a `folder`, so messages outside INBOX can be found, moved, or deleted.

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
