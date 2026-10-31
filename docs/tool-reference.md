# Email MCP tool reference

The server exposes sixteen tools over the Model Context Protocol (MCP) stdio transport. The following reference describes their input objects, returned JSON and error behavior. All examples are fictional and use reserved `.test` addresses; example message IDs and mailbox UIDs do not identify real messages.

## Calls and results

Invoke a tool with its name and an `arguments` object through an MCP client. The server advertises its input schemas through `tools/list`. Successful tool results contain one text content item whose `text` is a JSON string:

```json
{
  "content": [
    { "type": "text", "text": "{\"success\":true,\"account\":\"work\",\"count\":0,\"folders\":[]}" }
  ]
}
```

Parse `content[0].text` to obtain the tool's response object. Failed operations set the MCP result's `isError` to `true` and return `success: false` in that JSON. Optional response properties are omitted when their value is unavailable, rather than necessarily being returned as `null`.

Every tool except `accounts_list` accepts an optional `account_name` string. It must name a configured account and be non-empty when supplied. When omitted, the server selects `DEFAULT_EMAIL_ACCOUNT` or the first configured account. Configuration and provider settings are described in the [README](../README.md).

Email IDs are **IMAP UIDs represented as positive numeric strings**, scoped to the selected account **and folder**. Tools that take an email ID work on INBOX unless a `folder` is supplied; use the same folder that returned the ID. UIDs are not sequence numbers or Internet Message-ID header values. A move changes a message's UID, and `draft_update` rewrites a draft under a new UID.

## Account safety switches

Three per-account settings (`READ_ONLY`, `ALLOW_DELETE`, `ALLOW_PERMANENT_DELETE`, or `read_only`, `allow_delete`, `allow_permanent_delete` in `EMAIL_ACCOUNTS_JSON`) restrict what the tools may do:

| Setting | Default | Effect |
| --- | --- | --- |
| `READ_ONLY` | `false` | Only `accounts_list`, `emails_find`, `emails_wait`, `attachment_get` and `folders_list` run, as does a `dry_run` of `emails_modify`. Every tool that sends, stores, moves, flags, deletes or changes folders returns an error. Searches do not mark messages as read. |
| `ALLOW_DELETE` | `true` | `false` rejects `delete` in `emails_modify` and `draft_delete`. Moving messages stays possible. |
| `ALLOW_PERMANENT_DELETE` | `false` | Required for `permanent: true`, `folder_delete` and `folder_empty`. |

## `accounts_list`

Lists every configured account and identifies the default. This tool takes an empty input object `{}` and does not select an individual account or connect to its mail servers.

Response:

| Field | Type | Meaning |
| --- | --- | --- |
| `success` | boolean | `true` when configuration was loaded. |
| `count` | integer | Number of configured accounts. |
| `default_account` | string | Selected default account name. |
| `accounts` | array | One account summary per configured account. |

Each account summary contains `name` (string), `is_default` (boolean), `smtp_configured` (boolean), `imap_configured` (boolean), `sender_count` (integer) and the safety switches `read_only`, `allow_delete` and `allow_permanent_delete` (booleans). The configured flags report the presence of host settings, not a successful provider connection. Credentials are not returned.

Example response:

```json
{"success":true,"count":1,"default_account":"work","accounts":[{"name":"work","is_default":true,"smtp_configured":true,"imap_configured":true,"sender_count":1,"read_only":false,"allow_delete":true,"allow_permanent_delete":false}]}
```

## `emails_find`

Finds messages in a folder. All inputs are optional:

| Input | Type | Default / behavior |
| --- | --- | --- |
| `account_name` | string | Default account selection as described above. |
| `folder` | string | `INBOX`. Folder path as returned by `folders_list`. |
| `query` | string | Text searched across subject, body, sender and recipients. Blank text adds no text condition. |
| `filters` | object | Structured filters listed below. |
| `limit` | integer | `20`; must be between `1` and `100` inclusive. |
| `offset` | integer | `0`; number of matching messages to skip, for paging. |
| `order` | `"newest"` or `"oldest"` | `"newest"`. Order of arrival in the folder (by UID), not by the `Date` header. |
| `include_content` | boolean | `false`; includes the message body when `true`. |
| `include_attachments` | boolean | `false`; includes all attachment bytes encoded as base64 when `true`. This can be very large; prefer `attachment_list` and `attachment_get`. |

`filters` accepts these optional properties:

| Filter | Type | Behavior |
| --- | --- | --- |
| `from`, `to`, `cc`, `bcc`, `subject` | string | Non-empty sender, recipient or subject search text. |
| `has_attachments` | boolean | `true` selects messages with attachments; `false` selects messages without them. |
| `is_unread`, `is_flagged`, `is_answered`, `is_draft` | boolean | `true` selects messages in that state, `false` the others. |
| `is_forwarded` | boolean | Messages that do (or do not) carry the `$Forwarded` keyword. Cannot be combined with `keyword` or `no_keyword`. |
| `keyword`, `no_keyword` | string | Messages that carry (or lack) a custom keyword; see `add_keywords` in `emails_modify`. |
| `min_size`, `max_size` | integer | Messages larger or smaller than this many bytes. |
| `after_date` | string | A valid date; `YYYY-MM-DD` is recommended. Maps to IMAP `SINCE`, which includes the specified calendar date. |
| `before_date` | string | A valid date; `YYYY-MM-DD` is recommended. Maps to IMAP `BEFORE`, which excludes the specified calendar date. |

Structured conditions are combined; the text query matches any of its four fields. Date search uses the IMAP server's date semantics.

Response: `success` (boolean), `account` (string), `total_found` (integer, **all** messages matching the search), `count` (integer, messages in this page), `offset` (integer), `has_more` (boolean), `next_offset` (integer, only when `has_more` is `true`) and `emails` (array of message objects). Pass `next_offset` as `offset` to read the next page.

Message objects:

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | IMAP UID to use in subsequent calls. |
| `thread_id` | optional string | Provider thread identifier, when supplied by the server. |
| `message_id` | optional string | Internet Message-ID header. |
| `subject` | string | Subject, or `(No Subject)` if absent. |
| `from` | string | First sender formatted from its name/address, or `Unknown`. |
| `reply_to` | optional string | First Reply-To address when available. |
| `to`, `cc` | string arrays | Formatted recipient addresses; empty arrays when absent. |
| `date` | string | ISO timestamp from the message envelope; current time is used if the envelope has no date. |
| `snippet` | optional string | Up to the first 200 characters of the parsed body when it is included and non-empty. |
| `body` | optional string | Parsed body when `include_content` is `true`; HTML is preferred, followed by text converted to HTML or plain text. |
| `is_unread`, `is_flagged` | boolean | Read and flag state. |
| `keywords` | optional string array | Custom keywords (flags without a leading backslash), omitted when there are none. |
| `has_attachments` | boolean | Whether the IMAP body structure identifies an attachment. |
| `attachment_list` | optional array | One `{part, filename, content_type, size}` object per attachment, taken from the message structure without downloading it. `size` is the encoded size in bytes. |
| `attachments` | optional array | Attachment objects with content when `include_attachments` is `true`; see Attachment format below. |

Example call arguments:

```json
{"account_name":"work","filters":{"is_unread":true,"after_date":"2026-10-01"},"limit":5,"include_content":true}
```

An empty result is `{"success":true,"account":"work","total_found":0,"count":0,"offset":0,"has_more":false,"emails":[]}`.

## `emails_wait`

Waits until new messages arrive in a folder and returns them. The server uses IMAP IDLE on a dedicated connection and re-checks every 15 seconds, so it also works with servers that do not push updates.

| Input | Type | Default / behavior |
| --- | --- | --- |
| `account_name` | string | Optional account selection. |
| `folder` | string | `INBOX`. |
| `timeout_seconds` | integer | `30`; between `1` and `120`. Many MCP clients abandon a tool call after about a minute. |
| `filters` | object | Only messages matching these filters (same fields as `emails_find`) end the wait. |
| `since_uid` | integer | Report messages with at least this UID. Defaults to messages arriving after the call starts. |
| `limit` | integer | `10`; between `1` and `50`. |
| `include_content` | boolean | `false`. |

Response: `success` (boolean), `account` (string), `folder` (string), `timed_out` (boolean, `true` when nothing matching arrived), `count` (integer), `next_uid` (integer) and `emails` (message objects, oldest first). Pass `next_uid` as `since_uid` in the next call to continue without missing or repeating messages.

## `attachment_get`

Downloads one attachment of a message.

| Input | Type | Required / behavior |
| --- | --- | --- |
| `account_name` | string | Optional account selection. |
| `email_id` | string | Required positive numeric UID. |
| `folder` | string | `INBOX`. |
| `filename` | string | Attachment file name from `attachment_list`. If several attachments share the name, the error lists their parts. |
| `part` | string | Attachment part id from `attachment_list`, for example `2` or `1.2`. |

Either `filename` or `part` is required. Response: `success` (boolean), `account` (string), `email_id` (string), `folder` (string), `filename` (string), `content_type` (string), `size` (integer, decoded bytes) and `content` (base64 string). Attachments larger than 25 MB are refused.

## `emails_modify`

Applies one or more changes to messages, selected either by ID or by a search:

| Input | Type | Required / behavior |
| --- | --- | --- |
| `account_name` | string | Optional account selection. |
| `folder` | string | `INBOX`. Folder that contains the selected messages. |
| `email_ids` | string array | Non-empty array of positive numeric UIDs. Required unless `filters` or `query` select the messages. |
| `filters`, `query` | object, string | Bulk selection: every message that matches (same fields as `emails_find`). At least one filter or a non-blank query is required. Cannot be combined with `email_ids`. |
| `dry_run` | boolean | With `filters`/`query`: report the number of matches and a sample, change nothing. |
| `expected_count` | integer | With `filters`/`query`: required for a real change; must equal the number of matches, otherwise the call is refused. |
| `mark_read`, `mark_unread` | boolean | Set the read state when `true`. Both cannot be `true`. |
| `flag`, `unflag` | boolean | Set or clear the flagged state when `true`. Both cannot be `true`. |
| `add_keywords`, `remove_keywords` | string array | One to ten custom keywords (letters, digits and `_ . $ -`, at most 50 characters; no system flags). Whether a provider stores arbitrary keywords depends on the provider. |
| `mark_spam` | boolean | Sets `$Junk`, clears `$NotJunk` and moves the message to the Junk folder (flagged `\Junk`, else a folder named Junk or Spam). |
| `mark_not_spam` | boolean | Sets `$NotJunk`, clears `$Junk` and moves the message back to INBOX. |
| `move_to_folder` | string | Destination folder path. |
| `copy_to_folder` | string | Destination folder path; the originals stay. |
| `delete` | boolean | Moves messages to the Trash folder. |
| `permanent` | boolean | With `delete`: removes messages for good. Requires `ALLOW_PERMANENT_DELETE`. |

At least one change must be requested (a `dry_run` needs none). `move_to_folder`, `copy_to_folder`, `delete` and `mark_spam`/`mark_not_spam` cannot be combined with one another. A bulk selection covers at most 500 messages; narrow the filters when more match. A supplied flag with value `false` does not request a change. Destination folder names are provider-specific and can be obtained with `folders_list`.

Response: `success` (boolean), `account` (string), `modified` (integer), `total` (integer), optional `deleted_to` or `moved_to` (folder paths) and optional `errors` (string array). `total` equals the number of selected messages; `modified` counts those whose requested operations completed. A server that refuses a move or copy (for example because the folder does not exist) is reported in `errors`. Operations are not transactional: a flag change can succeed before a later move fails for the same message. Check both the counts and errors before retrying.

A `dry_run` returns `{"success":true,"account":"work","dry_run":true,"matched":3,"sample":[{"id":"42","subject":"…","from":"…","date":"…"}]}` with up to ten sample messages.

Example call arguments: `{"account_name":"work","email_ids":["42"],"mark_read":true}`.

Example response: `{"success":true,"account":"work","modified":1,"total":1}`.

## `email_send`

Sends a new message through SMTP:

| Input | Type | Required / default |
| --- | --- | --- |
| `account_name` | string | Optional account selection. |
| `to` | string array | Required, non-empty; every entry must be a non-empty string. |
| `subject`, `body` | string | Required and non-empty. |
| `body_type` | `"plain"` or `"html"` | Optional; defaults to `"html"`. |
| `from_email` | string | Optional, non-empty sender address. If the account has a `sender_emails` allowlist, it must match an entry, case-insensitively. |
| `cc`, `bcc` | string array | Optional; empty arrays are accepted. Each supplied entry must be non-empty. |
| `attachments` | array | Optional attachment objects, described below. |
| `reply_to` | string | Optional single address for the `Reply-To` header. |
| `priority` | `"high"`, `"normal"` or `"low"` | Optional; sets `X-Priority`, `X-MSMail-Priority` and `Importance` for `high` and `low`. |
| `read_receipt` | boolean | Optional; `true` requests a read receipt (`Disposition-Notification-To` the sender). |
| `headers` | object | Optional custom headers as name/value strings (at most 20, values single-line and at most 998 characters). Standard headers such as `From`, `Subject` or `Content-Type` cannot be set. |

The default sender is the first configured `sender_emails` entry, or the SMTP login when no allowlist is configured. The configured default sender name is used when available. Recipient strings are passed to the mail transport; these checks do not constitute verification that an address exists. SMTP always requires verified TLS.

Response: `success` (boolean), `account` (string), `message_id` (string), `to` (string array) and `subject` (string). When the account has `save_to_sent` enabled, `sent_copy` reports `saved` (boolean), the `folder` used and, when storing failed, an `error`; the message is delivered either way. Success reports the SMTP operation and generated Message-ID; it does not confirm delivery to a recipient's inbox.

Example call arguments:

```json
{"account_name":"work","to":["recipient@example.test"],"subject":"Example update","body":"This is a fictional example.","body_type":"plain"}
```

Example response:

```json
{"success":true,"account":"work","message_id":"<fictional-message@example.test>","to":["recipient@example.test"],"subject":"Example update"}
```

## `email_respond`

Replies to or forwards an existing message:

| Input | Type | Required / default |
| --- | --- | --- |
| `account_name` | string | Optional account selection. |
| `email_id` | string | Required positive numeric IMAP UID. |
| `folder` | string | `INBOX`. Folder that contains the message. |
| `body` | string | Required and non-empty response text. |
| `response_type` | `"reply"`, `"reply_all"` or `"forward"` | Optional; defaults to `"reply"`. |
| `body_type` | `"plain"` or `"html"` | Optional; defaults to `"html"`. |
| `to` | string array | Required and non-empty for forwarding. Optional for replies; a non-empty array overrides calculated recipients. An empty reply override uses calculated recipients. |
| `include_original` | boolean | Optional; defaults to `true`, appending the original body when available. |
| `include_attachments` | boolean | Optional; defaults to `true`, retaining original attachments when present. |
| `additional_attachments` | array | Optional attachment objects to add. |

Replies use the original Reply-To address when available, otherwise the original sender. `reply_all` also includes original To/CC recipients, removing duplicate added addresses and the account's SMTP login/sender aliases. Replies add `Re:` when needed and set In-Reply-To/References from the original Message-ID. Forwards add `Fwd:` when needed. The sender is the account's default sender. After sending, the original is flagged `\Answered` (reply) or `$Forwarded` (forward).

Response: `success` (boolean), `account` (string), `message_id` (string), `response_type` (string), `original_email_id` (string), `original_flagged` (boolean, whether the original could be flagged) and, with `save_to_sent`, `sent_copy` as for `email_send`. As with `email_send`, SMTP success is not a recipient-delivery confirmation.

Example call arguments: `{"account_name":"work","email_id":"42","response_type":"reply","body":"Example reply.","body_type":"plain","include_original":false,"include_attachments":false}`.

Example response: `{"success":true,"account":"work","message_id":"<fictional-reply@example.test>","response_type":"reply","original_email_id":"42","original_flagged":true}`.

## `draft_create`

Stores a message in the Drafts folder without sending it.

| Input | Type | Required / default |
| --- | --- | --- |
| `account_name` | string | Optional account selection. |
| `subject` | string | Required unless `reply_to_email_id` is given. |
| `body` | string | Required and non-empty. |
| `body_type` | `"plain"` or `"html"` | Optional; defaults to `"html"`. |
| `to`, `cc`, `bcc` | string array | Optional; a draft may have no recipients yet. |
| `from_email` | string | Optional sender, subject to the `sender_emails` allowlist. |
| `attachments` | array | Optional attachment objects. |
| `reply_to`, `priority`, `read_receipt`, `headers` | | The send options described for `email_send`. |
| `folder` | string | Folder to store the draft in; defaults to the folder flagged `\Drafts`, else a folder named Drafts/Entwürfe. |
| `reply_to_email_id` | string | Makes the draft a reply to this message: recipients, `Re:` subject, In-Reply-To/References and the quoted original are filled in. `to` overrides the recipients. |
| `reply_to_folder` | string | Folder of that message; `INBOX`. |
| `reply_all` | boolean | With `reply_to_email_id`: address all original recipients. |
| `include_original` | boolean | With `reply_to_email_id`: quote the original; defaults to `true`. |

Response: `success` (boolean), `account` (string), `folder` (string), `email_id` (string, the draft's UID) and `subject`.

## `draft_update`

Changes an existing draft. Only the supplied fields change: `to`, `cc`, `bcc`, `subject`, `body`, `body_type`, `from_email`, `attachments` (replaces all attachments) and the send options `reply_to`, `priority`, `read_receipt` and `headers` (replaces all custom headers). An empty array clears recipients or attachments. Unchanged fields, threading headers and the Message-ID are kept. Inputs: `email_id` (required) and an optional `folder` (the Drafts folder by default).

IMAP cannot edit a message in place, so the draft is rewritten and the old copy removed. Response: `success`, `account`, `folder`, `previous_email_id` and the draft's new `email_id`.

## `draft_send`

Sends a stored draft and removes it from the Drafts folder. Inputs: `email_id` (required) and an optional `folder`. The draft needs at least one `to` recipient. Response: `success`, `account`, `message_id`, `draft_removed` (boolean) and, with `save_to_sent`, `sent_copy`.

## `draft_delete`

Deletes drafts. Inputs: `email_ids` (required), optional `folder` and `permanent`. Drafts move to the Trash folder; `permanent: true` removes them for good and needs `ALLOW_PERMANENT_DELETE`. Response: `success`, `account`, `folder`, `deleted` (integer), `total` (integer) and optional `deleted_to` and `errors`.

## `folders_list`

Lists the selected account's folders:

| Input | Type | Default |
| --- | --- | --- |
| `account_name` | string | Optional account selection. |
| `include_counts` | boolean | Optional; `false`. Requests total and unread counts for each folder when `true`. |

Response: `success` (boolean), `account` (string), `count` (integer) and `folders` (array). Each folder has `name` and `path` strings, `delimiter` (the hierarchy separator), `subscribed` and `selectable` (booleans) and, when present, `parent` (the parent's path) and `special_use` (`\Sent`, `\Drafts`, `\Trash`, `\Junk`, `\Archive` or `\Inbox`). `total_count` and `unread_count` are optional integers, included when counts are requested and the provider status request succeeds. A folder can still be returned when its count request fails.

Example response: `{"success":true,"account":"work","count":1,"folders":[{"name":"INBOX","path":"INBOX","delimiter":"/","special_use":"\\Inbox","subscribed":true,"selectable":true,"total_count":12,"unread_count":3}]}`.

## `folder_create`

Creates a folder. Input: `name` (required), a path such as `Projects` or `Projects/2026`; use the account's separator from `folders_list`. Response: `success`, `account` and `folder`. An existing folder is an error. The new folder is subscribed.

## `folder_rename`

Renames a folder or moves it elsewhere in the tree. Inputs: `name` (current path) and `new_name`, both required. Messages and subfolders stay with it and the subscription moves to the new name. INBOX and special folders (Sent, Drafts, Trash, Junk …) cannot be renamed, and an existing destination is an error. Response: `success`, `account`, `from` and `to`.

## `folder_empty`

Permanently removes all messages from a Trash or Junk folder. Inputs: `name` (required, the folder's path) and `older_than_days` (optional non-negative integer, only messages older than this). Any other folder is refused. Requires `ALLOW_PERMANENT_DELETE`. Response: `success`, `account`, `folder` and `deleted` (integer).

## `folder_delete`

Deletes a folder and the messages in it. Input: `name` (required). INBOX and special folders are refused. Requires `ALLOW_PERMANENT_DELETE`. Response: `success`, `account` and `deleted` (the removed path).

## Attachment format

Both outgoing attachment inputs and returned attachment objects use `filename` (string), `content` (base64-encoded string) and optional `content_type` (MIME-type string). Each outgoing entry requires `filename` and `content`. The handler checks their string types; it does not enforce canonical base64 syntax. Incoming attachments without a filename are named `unnamed`.

Fictional attachment example: `{"filename":"example.txt","content":"RXhhbXBsZS4=","content_type":"text/plain"}`.

## Errors and partial results

Configuration, argument validation and connection failures normally return `{"success":false,"error":"message"}` inside the MCP text result, with `isError: true` on the MCP result. Unknown tool names use the same error wrapper. Malformed MCP protocol requests can instead be rejected by the MCP SDK at the protocol layer. Where the IMAP server explains a refusal, its response code and text are appended to the message.

Examples of validation messages include `limit must be an integer between 1 and 100`, `email_ids entries must be positive numeric UIDs`, `mark_read and mark_unread cannot both be true`, `body_type must be plain or html`, `to is required for forward`, `Account is read-only: emails_modify is disabled (READ_ONLY)` and `5 emails match. Check them with dry_run: true, then repeat with expected_count: 5`. Invalid account names and provider connection/authentication failures also return errors. Provider-dependent messages are not a fixed enumeration.

For `emails_modify` and `draft_delete`, partial failures use the tool-specific `account`, `modified`/`deleted`, `total` and `errors` fields described above, rather than the single `error` property. Inspect `success` even when a response contains useful partial results.
