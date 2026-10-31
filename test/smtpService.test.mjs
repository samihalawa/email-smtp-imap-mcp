import assert from 'node:assert/strict';
import test from 'node:test';

import { buildReplyRecipients, buildSentCopy, resolveFromEmail } from '../build/smtpService.js';
import { resolveSentFolder } from '../build/imapService.js';

const account = {
  smtp_host: 'smtp.example.test',
  smtp_port: 587,
  smtp_secure: false,
  smtp_user: 'relay-login@example.test',
  smtp_pass: 'test-pass',
  imap_host: 'imap.example.test',
  imap_port: 993,
  imap_secure: true,
  imap_user: 'relay-login@example.test',
  imap_pass: 'test-pass',
  sender_emails: ['sender@example.test', 'alias@example.test']
};

test('uses the first configured sender instead of the SMTP login by default', () => {
  assert.equal(resolveFromEmail(account), 'sender@example.test');
});

test('allows configured aliases and rejects unknown sender addresses', () => {
  assert.equal(resolveFromEmail(account, 'ALIAS@example.test'), 'ALIAS@example.test');
  assert.throws(
    () => resolveFromEmail(account, 'unknown@example.test'),
    /is not allowed for this account/
  );
});

test('builds reply-all recipients without adding the account or its aliases', () => {
  const recipients = buildReplyRecipients(account, {
    from: 'Sender <sender@outside.test>',
    reply_to: 'Replies <reply@outside.test>',
    to: ['Alias <alias@example.test>', 'Colleague <colleague@outside.test>'],
    cc: ['Login <relay-login@example.test>', 'COLLEAGUE@outside.test', 'Other <other@outside.test>']
  }, true);

  assert.deepEqual(recipients, [
    'reply@outside.test',
    'colleague@outside.test',
    'other@outside.test'
  ]);
});

test('uses explicit reply recipients as the documented override', () => {
  const recipients = buildReplyRecipients(account, {
    from: 'sender@outside.test',
    to: [],
    cc: []
  }, true, ['override@example.test']);

  assert.deepEqual(recipients, ['override@example.test']);
});

test('builds a sent copy that keeps Bcc, Message-ID and Date', async () => {
  const raw = (await buildSentCopy({
    from: '"Sender" <sender@example.test>',
    to: 'to@outside.test',
    bcc: 'hidden@outside.test',
    subject: 'Hello',
    text: 'Body',
    messageId: '<fixed-id@example.test>',
    date: new Date('2026-01-02T03:04:05Z')
  })).toString();

  assert.match(raw, /^Bcc: hidden@outside\.test\r$/m);
  assert.match(raw, /^Message-ID: <fixed-id@example\.test>\r$/m);
  assert.match(raw, /^Date: Fri, 02 Jan 2026 03:04:05 \+0000\r$/m);
});

test('resolves the sent folder from config, special-use flag, or fallback', () => {
  const folders = [{ path: 'INBOX' }, { path: 'Gesendete Objekte', specialUse: '\\Sent' }];
  assert.equal(resolveSentFolder(folders, 'Custom/Sent'), 'Custom/Sent');
  assert.equal(resolveSentFolder(folders), 'Gesendete Objekte');
  assert.equal(resolveSentFolder([{ path: 'INBOX' }]), 'Sent');
});
