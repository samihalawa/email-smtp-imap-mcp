import assert from 'node:assert/strict';
import test from 'node:test';

import { buildReplyRecipients, buildSentCopy, resolveFromEmail } from '../build/smtpService.js';
import { resolveSentFolder, resolveSpecialFolder } from '../build/imapService.js';

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

test('new tools validate input before connecting', async () => {
  const { handleDraftCreate, handleEmailsModify, handleFolderDelete } = await import('../build/emailHandlers.js');
  process.env.EMAIL_ACCOUNTS_JSON = JSON.stringify({
    t: {
      allow_permanent_delete: true,
      smtp: { host: 'smtp.test', user: 't@example.com', password: 'x' },
      imap: { host: 'imap.test', user: 't@example.com', password: 'x' }
    }
  });
  assert.match(JSON.parse(await handleDraftCreate({ body: 'x' })).error, /subject is required/);
  assert.match(JSON.parse(await handleEmailsModify({ email_ids: ['1'], permanent: true })).error, /permanent requires delete/);
  assert.match(JSON.parse(await handleEmailsModify({ email_ids: ['1'], delete: true, move_to_folder: 'A' })).error, /cannot be combined/);
  assert.match(JSON.parse(await handleFolderDelete({ name: 'INBOX' })).error, /INBOX cannot be deleted/);
});

test('falls back to well-known localized folder names when nothing is flagged', () => {
  const german = [{ path: 'INBOX' }, { path: 'Gesendete Objekte' }, { path: 'Entwürfe' }, { path: 'Papierkorb' }, { path: 'Spam' }];
  assert.equal(resolveSentFolder(german), 'Gesendete Objekte');
  assert.equal(resolveSpecialFolder(german, '\\Drafts', 'Drafts'), 'Entwürfe');
  assert.equal(resolveSpecialFolder(german, '\\Trash', 'Trash'), 'Papierkorb');
  assert.equal(resolveSpecialFolder([{ path: 'INBOX' }], '\\Trash', 'Trash'), 'Trash');
  const flagged = [{ path: 'Papierkorb' }, { path: 'Deleted Items', specialUse: '\\Trash' }];
  assert.equal(resolveSpecialFolder(flagged, '\\Trash', 'Trash'), 'Deleted Items');
});

test('message extras are validated and applied to mail options', async () => {
  const { parseMessageExtras, applyMessageExtras, parseKeywords } = await import('../build/messageOptions.js');
  const extras = parseMessageExtras({ reply_to: ' desk@example.test ', priority: 'high', read_receipt: true, headers: { 'X-Ticket': '1' } });
  assert.deepEqual(extras, { replyTo: 'desk@example.test', priority: 'high', readReceipt: true, headers: { 'X-Ticket': '1' } });

  const options = {};
  applyMessageExtras(options, extras, 'me@example.test');
  assert.deepEqual(options, {
    replyTo: 'desk@example.test',
    headers: {
      'X-Ticket': '1',
      'X-Priority': '1 (Highest)',
      'X-MSMail-Priority': 'High',
      Importance: 'High',
      'Disposition-Notification-To': 'me@example.test'
    }
  });

  const plain = {};
  applyMessageExtras(plain, { priority: 'normal' }, 'me@example.test');
  assert.deepEqual(plain, {}, 'normal priority adds no header');

  assert.throws(() => parseMessageExtras({ headers: { 'Content-Type': 'text/evil' } }), /cannot be set/);
  assert.throws(() => parseMessageExtras({ headers: Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`X-${i}`, 'v'])) }), /At most 20/);
  assert.deepEqual(parseKeywords(['A', '$b.c-d_e'], 'k'), ['A', '$b.c-d_e']);
  assert.equal(parseKeywords(undefined, 'k'), undefined);
  assert.throws(() => parseKeywords(['\\Seen'], 'k'), /keywords/);
});
