# Email SMTP/IMAP

Search and read messages, send email, reply or forward, update flags and folders, and switch between named accounts from Claude Code or a local Cowork session. The plugin starts Sami Halawa's open source **email-smtp-imap-mcp 2.2.2** server on your computer using the standard MCP stdio transport. It connects directly to the SMTP and IMAP providers you configure.

## Requirements and setup

Use a current Claude Code or a local Cowork session that supports plugin configuration and local MCP servers. Local MCP tools run in Claude Code and Cowork sessions on your computer; they are not available in ordinary Claude chat. Node.js **20 or later**, npm and `npx` must be available. The first launch downloads the pinned package from npm when it is not already cached.

For local use from this repository, load the folder with:

```sh
claude --plugin-dir ./plugins/email-smtp-imap
```

In the plugin's configuration, fill in **Email accounts (JSON)** with a JSON object like the example below. Replace every example host, username and app-password placeholder with your provider's settings. These are illustrative values, not working credentials.

```json
{
  "work": {
    "smtp": {
      "host": "smtp.example.invalid",
      "port": 587,
      "secure": false,
      "user": "you@example.invalid",
      "password": "replace-with-your-smtp-app-password"
    },
    "imap": {
      "host": "imap.example.invalid",
      "port": 993,
      "secure": true,
      "user": "you@example.invalid",
      "password": "replace-with-your-imap-app-password"
    }
  }
}
```

Add more named entries to use multiple accounts. Set **Default email account** to one of those names, or leave it blank to use the first account. SMTP on port 587 uses mandatory STARTTLS despite `secure: false`; `secure: true` selects implicit TLS, commonly on port 465. IMAP commonly uses implicit TLS on port 993. Both connections require certificate validation. Use app passwords where your provider requires them.

## What you can do

The server exposes six tools: `accounts_list`, `emails_find`, `emails_modify`, `email_send`, `email_respond` and `folders_list`. For example, ask Claude to find unread messages in a named account, read a selected message, draft and send your reply, or move a message to another folder. The [tool reference](https://github.com/samihalawa/email-smtp-imap-mcp/blob/main/docs/tool-reference.md) describes the exact inputs, results and errors.

## Data and credentials

The account JSON is marked as a sensitive plugin configuration field and is passed to the local server process as `EMAIL_ACCOUNTS_JSON`. The optional default account name is ordinary configuration. Do not put real passwords in repository files, public issues or chat messages.

The server uses your credentials to connect to the email providers you specify. Email content and metadata returned by tools are supplied to the Claude client and can be processed as part of your conversation. Sending, replying, moving messages and changing flags affect the selected mailbox. Attachments use base64 content in the server's tool inputs; your Claude client may need to read a local file before supplying that content. This plugin adds no separate hosted mail relay or analytics service.

## Project and support

Plugin version **1.0.0** launches the existing server version **2.2.2**; installing it does not alter that published package. Source code, configuration guidance, release artifacts and licence materials are available in the [project repository](https://github.com/samihalawa/email-smtp-imap-mcp). Contact [Sami Halawa](mailto:sami@samihalawa.com) or use the [issue tracker](https://github.com/samihalawa/email-smtp-imap-mcp/issues) for support, without including credentials or private messages. The plugin is distributed under the included MIT licence.
