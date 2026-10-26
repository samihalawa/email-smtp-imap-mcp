import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchEmailByIdFromClient } from '../build/imapService.js';

test('fetches the requested email as an exact IMAP UID', async () => {
  const calls = [];
  const client = {
    async mailboxOpen(mailbox, options) {
      calls.push(['mailboxOpen', mailbox, options]);
    },
    async fetchOne(sequence, query, options) {
      calls.push(['fetchOne', sequence, query, options]);
      return {
        seq: 7,
        uid: 42,
        flags: new Set(),
        envelope: {
          messageId: '<message-42@example.test>',
          subject: 'Exact message',
          date: new Date('2026-08-10T20:00:00Z'),
          from: [{ name: 'Sender', address: 'sender@example.test' }],
          to: [{ name: 'Receiver', address: 'receiver@example.test' }]
        },
        source: Buffer.from([
          'Message-ID: <message-42@example.test>',
          'From: Sender <sender@example.test>',
          'To: Receiver <receiver@example.test>',
          'Subject: Exact message',
          'Content-Type: text/plain; charset=utf-8',
          '',
          'Requested body'
        ].join('\r\n'))
      };
    }
  };

  const message = await fetchEmailByIdFromClient(client, '42');
  assert.equal(message.id, '42');
  assert.equal(message.message_id, '<message-42@example.test>');
  assert.match(message.body, /Requested body/);
  assert.deepEqual(calls[0], ['mailboxOpen', 'INBOX', { readOnly: true }]);
  assert.equal(calls[1][1], '42');
  assert.deepEqual(calls[1][3], { uid: true });
});

test('picks a parsed attachment by unique name, else by position', async () => {
  const { pickParsedAttachment, describeError } = await import('../build/imapService.js');
  const parsed = [
    { filename: 'a.txt', content: Buffer.from('a') },
    { filename: 'dup.txt', content: Buffer.from('1') },
    { filename: 'dup.txt', content: Buffer.from('2') }
  ];
  assert.equal(pickParsedAttachment(parsed, { part: '1', filename: 'a.txt', content_type: 'text/plain', size: 1 }, 0).content.toString(), 'a');
  assert.equal(pickParsedAttachment(parsed, { part: '3', filename: 'dup.txt', content_type: 'text/plain', size: 1 }, 2).content.toString(), '2');
  assert.equal(pickParsedAttachment(parsed, { part: '9', filename: 'gone.txt', content_type: 'text/plain', size: 1 }, 7), undefined);

  assert.equal(describeError({ message: 'Command failed', serverResponseCode: 'NONEXISTENT', responseText: 'Mailbox missing' }), 'Command failed: NONEXISTENT Mailbox missing');
  assert.equal(describeError(new Error('plain')), 'plain');
});
