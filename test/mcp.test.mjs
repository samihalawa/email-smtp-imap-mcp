import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SMTPServer } from 'smtp-server';

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server.address ? server.address() : server.server.address());
    });
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function createImapTestServer() {
  const commands = [];
  const server = createServer((socket) => {
    let buffer = '';
    let authenticationTag;
    socket.setEncoding('utf8');
    socket.write('* OK Local IMAP test server ready\r\n');

    socket.on('data', (chunk) => {
      buffer += chunk;
      while (buffer.includes('\r\n')) {
        const lineEnd = buffer.indexOf('\r\n');
        const line = buffer.slice(0, lineEnd);
        buffer = buffer.slice(lineEnd + 2);

        if (authenticationTag) {
          socket.write(`${authenticationTag} OK AUTHENTICATE completed\r\n`);
          authenticationTag = undefined;
          continue;
        }

        const match = line.match(/^(\S+)\s+(\S+)/);
        if (!match) continue;
        const [, tag, rawCommand] = match;
        const command = rawCommand.toUpperCase();
        commands.push(line);

        const writeMessage = (sequence, uid, subject, fromUser) => {
          const messageDate = uid === 42
            ? 'Tue, 11 Aug 2026 10:00:00 +0000'
            : 'Mon, 10 Aug 2026 10:00:00 +0000';
          const source = [
            `Message-ID: <message-${uid}@example.test>`,
            `From: ${fromUser}@example.test`,
            'To: sender@example.test',
            `Subject: ${subject}`,
            'Content-Type: text/plain; charset=utf-8',
            '',
            `Body for message ${uid}`
          ].join('\r\n');
          socket.write(
            `* ${sequence} FETCH (UID ${uid} FLAGS () ` +
            `ENVELOPE ("${messageDate}" "${subject}" ` +
            `((NIL NIL "${fromUser}" "example.test")) NIL NIL ((NIL NIL "sender" "example.test")) NIL NIL NIL "<message-${uid}@example.test>") ` +
            `BODYSTRUCTURE ("TEXT" "PLAIN" ("CHARSET" "utf-8") NIL NIL "7BIT" 19 1 NIL NIL NIL) ` +
            `BODY[] {${Buffer.byteLength(source)}}\r\n${source})\r\n`
          );
        };

        if (command === 'CAPABILITY') {
          socket.write(`* CAPABILITY IMAP4rev1 AUTH=PLAIN\r\n${tag} OK CAPABILITY completed\r\n`);
        } else if (command === 'AUTHENTICATE') {
          authenticationTag = tag;
          socket.write('+ \r\n');
        } else if (command === 'LOGIN' || command === 'ID') {
          socket.write(`${tag} OK ${command} completed\r\n`);
        } else if (command === 'LIST') {
          if (/\s""\s""$/.test(line)) {
            socket.write(`* LIST (\\Noselect) "/" ""\r\n`);
          } else {
            socket.write(`* LIST (\\HasNoChildren) "/" "INBOX"\r\n`);
            socket.write(`* LIST (\\HasNoChildren) "/" "Archive"\r\n`);
          }
          socket.write(`${tag} OK LIST completed\r\n`);
        } else if (command === 'SELECT' || command === 'EXAMINE') {
          socket.write('* 2 EXISTS\r\n');
          socket.write('* 0 RECENT\r\n');
          socket.write('* FLAGS (\\Seen \\Answered \\Flagged \\Deleted \\Draft)\r\n');
          socket.write('* OK [UIDVALIDITY 12345] UIDs valid\r\n');
          socket.write('* OK [UIDNEXT 43] Predicted next UID\r\n');
          socket.write(`${tag} OK [${command === 'EXAMINE' ? 'READ-ONLY' : 'READ-WRITE'}] ${command} completed\r\n`);
        } else if (command === 'FETCH') {
          writeMessage(1, 41, 'First test email', 'first');
          writeMessage(2, 42, 'Newest test email', 'newest');
          socket.write(`${tag} OK FETCH completed\r\n`);
        } else if (command === 'UID' && /\sFETCH\s/i.test(line)) {
          writeMessage(2, 42, 'Newest test email', 'newest');
          socket.write(`${tag} OK UID FETCH completed\r\n`);
        } else if (command === 'UID' && /\sSTORE\s/i.test(line)) {
          socket.write('* 2 FETCH (UID 42 FLAGS (\\Seen))\r\n');
          socket.write(`${tag} OK UID STORE completed\r\n`);
        } else if (command === 'SEARCH' || (command === 'UID' && /\sSEARCH\s/i.test(line))) {
          socket.write('* SEARCH 41 42\r\n');
          socket.write(`${tag} OK SEARCH completed\r\n`);
        } else if (command === 'LOGOUT') {
          socket.write(`* BYE Logging out\r\n${tag} OK LOGOUT completed\r\n`);
          socket.end();
        } else {
          socket.write(`${tag} OK ${command} completed\r\n`);
        }
      }
    });
  });

  server.commands = commands;
  return server;
}

test('serves all tools over stdio and marks failed calls as errors', async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve('build/index.js')],
    env: {
      PATH: process.env.PATH || '',
      EMAIL_ACCOUNTS_JSON: JSON.stringify({
        test: {
          smtp: { host: 'smtp.test', user: 'test@example.com', password: 'test-pass' },
          imap: { host: 'imap.test', user: 'test@example.com', password: 'test-pass' }
        }
      }),
      DEFAULT_EMAIL_ACCOUNT: 'test'
    }
  });
  const client = new Client({ name: 'email-mcp-test', version: '1.0.0' });

  try {
    await client.connect(transport);
    const listed = await client.listTools();
    assert.deepEqual(
      listed.tools.map((tool) => tool.name).sort(),
      ['accounts_list', 'email_respond', 'email_send', 'emails_find', 'emails_modify', 'folders_list']
    );

    const result = await client.callTool({
      name: 'emails_modify',
      arguments: { email_ids: [] }
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /email_ids is required/);

    const accountsResult = await client.callTool({ name: 'accounts_list', arguments: {} });
    const accountsPayload = JSON.parse(accountsResult.content[0].text);
    assert.equal(accountsPayload.count, 1);
    assert.equal(accountsPayload.default_account, 'test');
    assert.equal(accountsPayload.accounts[0].name, 'test');

    const invalidLimit = await client.callTool({
      name: 'emails_find',
      arguments: { limit: 101 }
    });
    assert.equal(invalidLimit.isError, true);
    assert.match(invalidLimit.content[0].text, /limit must be an integer between 1 and 100/);

    const invalidResponseType = await client.callTool({
      name: 'email_respond',
      arguments: { email_id: '1', body: 'Test', response_type: 'invalid' }
    });
    assert.equal(invalidResponseType.isError, true);
    assert.match(invalidResponseType.content[0].text, /response_type must be reply, reply_all, or forward/);
  } finally {
    await client.close();
  }
});

test('loads arbitrary account counts from a multiline .env file', async () => {
  const workingDirectory = await mkdtemp(path.join(os.tmpdir(), 'email-mcp-env-'));
  const serverPath = path.resolve('build/index.js');
  const accounts = Object.fromEntries(
    Array.from({ length: 25 }, (_, index) => {
      const number = index + 1;
      return [`account-${number}`, {
        smtp: {
          host: `smtp-${number}.example.test`,
          port: 587,
          user: `user-${number}@example.test`,
          password: `smtp-password-${number}`
        },
        imap: {
          host: `imap-${number}.example.test`,
          port: 993,
          user: `user-${number}@example.test`,
          password: `imap-password-${number}`
        }
      }];
    })
  );

  await writeFile(
    path.join(workingDirectory, '.env'),
    `EMAIL_ACCOUNTS_JSON='${JSON.stringify(accounts, null, 2)}'\nDEFAULT_EMAIL_ACCOUNT="account-25"\n`
  );

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    cwd: workingDirectory,
    env: { PATH: process.env.PATH || '' }
  });
  const client = new Client({ name: 'email-mcp-env-test', version: '1.0.0' });

  try {
    await client.connect(transport);
    const result = await client.callTool({ name: 'accounts_list', arguments: {} });
    const payload = JSON.parse(result.content[0].text);
    assert.equal(result.isError, undefined);
    assert.equal(payload.success, true);
    assert.equal(payload.count, 25);
    assert.equal(payload.default_account, 'account-25');
    assert.deepEqual(payload.accounts.map((account) => account.name), Object.keys(accounts));
    assert.equal(payload.accounts[24].smtp_configured, true);
    assert.equal(payload.accounts[24].imap_configured, true);
  } finally {
    await client.close();
    await rm(workingDirectory, { recursive: true, force: true });
  }
});

test('runs send, find, modify, reply, and folder tools through local SMTP/IMAP protocols', async () => {
  const receivedMessages = [];
  const smtpServer = new SMTPServer({
    secure: false,
    allowInsecureAuth: true,
    disabledCommands: ['STARTTLS'],
    onAuth(auth, _session, callback) {
      if (auth.username === 'local@example.test' && auth.password === 'smtp-password') {
        callback(null, { user: auth.username });
      } else {
        callback(new Error('Invalid local SMTP credentials'));
      }
    },
    onData(stream, _session, callback) {
      let message = '';
      stream.setEncoding('utf8');
      stream.on('data', (chunk) => { message += chunk; });
      stream.on('end', () => {
        receivedMessages.push(message);
        callback();
      });
    }
  });
  const imapServer = createImapTestServer();
  const smtpAddress = await listen(smtpServer);
  const imapAddress = await listen(imapServer);
  const workingDirectory = await mkdtemp(path.join(os.tmpdir(), 'email-mcp-protocol-'));
  const runtimeDirectory = path.join(workingDirectory, 'runtime');
  const environmentFile = path.join(workingDirectory, 'accounts.env');
  await mkdir(runtimeDirectory);
  const serverPath = path.resolve('build/index.js');

  const account = {
    smtp: {
      host: '127.0.0.1',
      port: smtpAddress.port,
      secure: false,
      user: 'local@example.test',
      password: 'smtp-password'
    },
    imap: {
      host: '127.0.0.1',
      port: imapAddress.port,
      secure: false,
      user: 'local@example.test',
      password: 'imap-password'
    },
    sender_emails: ['sender@example.test']
  };
  await writeFile(
    environmentFile,
    `EMAIL_ACCOUNTS_JSON='${JSON.stringify({ local: account }, null, 2)}'\nDEFAULT_EMAIL_ACCOUNT="local"\n`
  );

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    cwd: runtimeDirectory,
    env: {
      PATH: process.env.PATH || '',
      EMAIL_ENV_FILE: environmentFile
    }
  });
  const client = new Client({ name: 'email-mcp-protocol-test', version: '1.0.0' });

  try {
    await client.connect(transport);
    const sendResult = await client.callTool({
      name: 'email_send',
      arguments: {
        account_name: 'local',
        to: ['recipient@example.test'],
        subject: 'MCP SMTP delivery proof',
        body: 'Sent through the actual SMTP transport.',
        body_type: 'plain'
      }
    });
    const sendPayload = JSON.parse(sendResult.content[0].text);
    assert.equal(sendPayload.success, true);
    assert.equal(sendPayload.account, 'local');
    assert.equal(receivedMessages.length, 1);
    assert.match(receivedMessages[0], /From: sender@example.test/);
    assert.match(receivedMessages[0], /To: recipient@example.test/);
    assert.match(receivedMessages[0], /Subject: MCP SMTP delivery proof/);
    assert.match(receivedMessages[0], /Sent through the actual SMTP transport\./);

    const foldersResult = await client.callTool({
      name: 'folders_list',
      arguments: { account_name: 'local' }
    });
    const foldersPayload = JSON.parse(foldersResult.content[0].text);
    assert.equal(foldersPayload.success, true);
    assert.equal(foldersPayload.account, 'local');
    assert.deepEqual(foldersPayload.folders.map((folder) => folder.path), ['INBOX', 'Archive']);

    const findResult = await client.callTool({
      name: 'emails_find',
      arguments: { account_name: 'local', limit: 2, include_content: true }
    });
    const findPayload = JSON.parse(findResult.content[0].text);
    assert.equal(findPayload.success, true);
    assert.equal(findPayload.count, 2);
    assert.deepEqual(findPayload.emails.map((email) => email.id), ['42', '41']);
    assert.match(findPayload.emails[0].body, /Body for message 42/);

    const modifyResult = await client.callTool({
      name: 'emails_modify',
      arguments: { account_name: 'local', email_ids: ['42'], mark_read: true }
    });
    const modifyPayload = JSON.parse(modifyResult.content[0].text);
    assert.equal(modifyPayload.success, true);
    assert.equal(modifyPayload.modified, 1);
    assert.ok(imapServer.commands.some((command) => /UID STORE 42 \+FLAGS/i.test(command)));

    const respondResult = await client.callTool({
      name: 'email_respond',
      arguments: {
        account_name: 'local',
        email_id: '42',
        response_type: 'reply',
        body: 'Reply sent through MCP.',
        body_type: 'plain',
        include_original: false,
        include_attachments: false
      }
    });
    const respondPayload = JSON.parse(respondResult.content[0].text);
    assert.equal(respondPayload.success, true, JSON.stringify(respondPayload));
    assert.equal(receivedMessages.length, 2);
    assert.match(receivedMessages[1], /To: newest@example.test/);
    assert.match(receivedMessages[1], /Subject: Re: Newest test email/);
    assert.match(receivedMessages[1], /In-Reply-To: <message-42@example.test>/);
  } finally {
    await client.close();
    await close(smtpServer);
    await close(imapServer);
    await rm(workingDirectory, { recursive: true, force: true });
  }
});
