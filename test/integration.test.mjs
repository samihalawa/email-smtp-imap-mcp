import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after, before, beforeEach } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import { dockerAvailable, startMailEnv } from './helpers/mailEnv.mjs';

const skip = dockerAvailable() ? false : 'Docker is not available';

let env;
let client;

async function call(name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  return { ...JSON.parse(result.content[0].text), isError: Boolean(result.isError) };
}

before(async () => {
  if (skip) return;
  env = await startMailEnv();
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve('build/index.js')],
    env: { PATH: process.env.PATH || '', ...env.serverEnv() }
  });
  client = new Client({ name: 'integration-test', version: '1.0.0' });
  await client.connect(transport);
});

after(async () => {
  if (skip) return;
  await client?.close();
  await env?.stop();
});

beforeEach(async () => {
  if (skip) return;
  await env.reset();
});

test('send delivers to the recipient and stores a sent copy', { skip }, async () => {
  const sent = await call('email_send', { to: ['bob@example.test'], subject: 'Hello Bob', body: 'Hi', body_type: 'plain' });
  assert.equal(sent.success, true);
  assert.equal(sent.sent_copy.saved, true);
  assert.equal(sent.sent_copy.folder, 'Sent');

  const inbox = await env.messages('bob');
  assert.deepEqual(inbox.map((m) => m.subject), ['Hello Bob']);
  const sentBox = await env.messages('alice', 'Sent');
  assert.deepEqual(sentBox.map((m) => m.subject), ['Hello Bob']);
  assert.ok(sentBox[0].flags.has('\\Seen'));
});

test('emails_find filters in INBOX and in other folders', { skip }, async () => {
  await env.seed('alice', { subject: 'Invoice 1', from: 'billing@example.test' });
  await env.seed('alice', { subject: 'Lunch', from: 'friend@example.test', flags: ['\\Seen'] });
  await env.seed('alice', { folder: 'Trash', subject: 'Old news' });

  const unread = await call('emails_find', { filters: { is_unread: true } });
  assert.deepEqual(unread.emails.map((e) => e.subject), ['Invoice 1']);

  const bySender = await call('emails_find', { filters: { from: 'friend@example.test' }, include_content: true });
  assert.equal(bySender.count, 1);
  assert.match(bySender.emails[0].body, /seed body/);

  const trash = await call('emails_find', { folder: 'Trash' });
  assert.deepEqual(trash.emails.map((e) => e.subject), ['Old news']);

  const missing = await call('emails_find', { folder: 'DoesNotExist' });
  assert.equal(missing.success, false);
});

test('emails_modify changes flags and moves messages', { skip }, async () => {
  const uid = await env.seed('alice', { subject: 'Organize me' });

  assert.equal((await call('emails_modify', { email_ids: [String(uid)], mark_read: true, flag: true })).success, true);
  let [message] = await env.messages('alice');
  assert.ok(message.flags.has('\\Seen') && message.flags.has('\\Flagged'));

  assert.equal((await call('emails_modify', { email_ids: [String(uid)], mark_unread: true, unflag: true })).success, true);
  [message] = await env.messages('alice');
  assert.ok(!message.flags.has('\\Seen') && !message.flags.has('\\Flagged'));

  assert.equal((await call('folder_create', { name: 'Archive' })).success, true);
  assert.equal((await call('emails_modify', { email_ids: [String(uid)], move_to_folder: 'Archive' })).success, true);
  assert.deepEqual(await env.messages('alice'), []);
  assert.deepEqual((await env.messages('alice', 'Archive')).map((m) => m.subject), ['Organize me']);

  const [moved] = await env.messages('alice', 'Archive');
  const back = await call('emails_modify', { folder: 'Archive', email_ids: [String(moved.uid)], move_to_folder: 'INBOX' });
  assert.equal(back.success, true);
  const [back1] = await env.messages('alice');
  const toNowhere = await call('emails_modify', { email_ids: [String(back1.uid)], move_to_folder: 'Nowhere' });
  assert.equal(toNowhere.success, false);
  assert.match(toNowhere.errors[0], /does the folder exist/);
  assert.deepEqual((await env.messages('alice')).map((m) => m.subject), ['Organize me']);
});

test('emails_modify delete moves to Trash, permanent removes for good', { skip }, async () => {
  const first = await env.seed('alice', { subject: 'Delete me' });
  const second = await env.seed('alice', { subject: 'Wipe me' });

  const soft = await call('emails_modify', { email_ids: [String(first)], delete: true });
  assert.equal(soft.success, true);
  assert.equal(soft.deleted_to, 'Trash');
  assert.deepEqual((await env.messages('alice', 'Trash')).map((m) => m.subject), ['Delete me']);

  const hard = await call('emails_modify', { email_ids: [String(second)], delete: true, permanent: true });
  assert.equal(hard.success, true);
  assert.deepEqual(await env.messages('alice'), []);
  assert.deepEqual((await env.messages('alice', 'Trash')).map((m) => m.subject), ['Delete me']);

  const [trashed] = await env.messages('alice', 'Trash');
  const purge = await call('emails_modify', { folder: 'Trash', email_ids: [String(trashed.uid)], delete: true, permanent: true });
  assert.equal(purge.success, true);
  assert.deepEqual(await env.messages('alice', 'Trash'), []);
});

test('draft_create stores a flagged draft without sending it', { skip }, async () => {
  const draft = await call('draft_create', {
    to: ['bob@example.test'],
    subject: 'Work in progress',
    body: '<p>Not done yet</p>',
    attachments: [{ filename: 'note.txt', content: Buffer.from('attached').toString('base64'), content_type: 'text/plain' }]
  });
  assert.equal(draft.success, true);
  assert.equal(draft.folder, 'Drafts');
  assert.ok(draft.email_id);

  const [stored] = await env.messages('alice', 'Drafts');
  assert.equal(stored.subject, 'Work in progress');
  assert.ok(stored.flags.has('\\Draft'));
  assert.equal(stored.parsed.attachments[0].filename, 'note.txt');
  assert.deepEqual(await env.messages('bob'), []);

  const noRecipient = await call('draft_create', { subject: 'Later', body: 'x', body_type: 'plain' });
  assert.equal(noRecipient.success, true);
  assert.equal((await env.messages('alice', 'Drafts')).length, 2);
});

test('folder_create and folder_delete manage folders and protect special ones', { skip }, async () => {
  const created = await call('folder_create', { name: 'Projects/2026' });
  assert.equal(created.success, true);
  assert.equal(created.folder, 'Projects/2026');

  const listed = await call('folders_list', { include_counts: true });
  const paths = listed.folders.map((f) => f.path);
  assert.ok(paths.includes('Projects/2026') && paths.includes('INBOX') && paths.includes('Sent'));

  assert.equal((await call('folder_create', { name: 'Projects/2026' })).success, false);

  for (const name of ['INBOX', 'Sent', 'Drafts', 'Trash']) {
    const refused = await call('folder_delete', { name });
    assert.equal(refused.success, false, `${name} must be protected`);
  }
  assert.equal((await call('folder_delete', { name: 'Nope' })).success, false);

  assert.equal((await call('folder_delete', { name: 'Projects/2026' })).success, true);
  const after = await call('folders_list');
  assert.ok(!after.folders.some((f) => f.path === 'Projects/2026'));
});

test('email_respond replies with threading headers and forwards', { skip }, async () => {
  const uid = await env.seed('alice', { subject: 'Question', from: 'bob@example.test', body: 'Can you help?' });

  const reply = await call('email_respond', { email_id: String(uid), body: 'Sure', response_type: 'reply', body_type: 'plain' });
  assert.equal(reply.success, true);
  const [received] = await env.messages('bob');
  assert.equal(received.subject, 'Re: Question');
  assert.ok(received.parsed.inReplyTo);
  assert.equal(reply.original_flagged, true);
  assert.ok((await env.messages('alice'))[0].flags.has('\\Answered'));

  const forward = await call('email_respond', {
    email_id: String(uid),
    body: 'FYI',
    response_type: 'forward',
    to: ['bob@example.test'],
    body_type: 'plain'
  });
  assert.equal(forward.success, true);
  const subjects = (await env.messages('bob')).map((m) => m.subject).sort();
  assert.deepEqual(subjects, ['Fwd: Question', 'Re: Question']);
});

test('read_only accounts can read but not change anything', { skip }, async () => {
  const uid = await env.seed('bob', { subject: 'Look but do not touch' });
  const readOnly = { account_name: 'bob' };

  const found = await call('emails_find', { ...readOnly, include_content: true });
  assert.equal(found.success, true);
  assert.equal(found.emails[0].subject, 'Look but do not touch');
  assert.ok(found.emails[0].is_unread);
  const [stillUnread] = await env.messages('bob');
  assert.ok(!stillUnread.flags.has('\\Seen'), 'reading must not mark mail as seen');
  assert.equal((await call('folders_list', readOnly)).success, true);

  const blocked = [
    ['email_send', { to: ['alice@example.test'], subject: 's', body: 'b' }],
    ['email_respond', { email_id: String(uid), body: 'b' }],
    ['draft_create', { subject: 's', body: 'b' }],
    ['draft_update', { email_id: String(uid), subject: 's' }],
    ['draft_send', { email_id: String(uid) }],
    ['draft_delete', { email_ids: [String(uid)] }],
    ['emails_modify', { email_ids: [String(uid)], mark_read: true }],
    ['emails_modify', { email_ids: [String(uid)], delete: true }],
    ['folder_create', { name: 'Nope' }],
    ['folder_delete', { name: 'Nope' }]
  ];
  for (const [name, args] of blocked) {
    const result = await call(name, { ...readOnly, ...args });
    assert.equal(result.success, false, `${name} must be blocked`);
    assert.match(result.error, /read-only/);
  }
  assert.equal((await env.messages('bob')).length, 1);
  assert.equal((await env.messages('alice')).length, 0);
});

test('permanent deletion and folder deletion are locked by default', { skip }, async () => {
  const uid = await env.seed('alice', { subject: 'Keep me' });
  await call('folder_create', { name: 'Keep' });
  const account = { account_name: 'alice_safe' };

  const permanent = await call('emails_modify', { ...account, email_ids: [String(uid)], delete: true, permanent: true });
  assert.equal(permanent.success, false);
  assert.match(permanent.error, /ALLOW_PERMANENT_DELETE/);
  const folder = await call('folder_delete', { ...account, name: 'Keep' });
  assert.equal(folder.success, false);
  assert.match(folder.error, /ALLOW_PERMANENT_DELETE/);
  assert.equal((await env.messages('alice')).length, 1);

  const soft = await call('emails_modify', { ...account, email_ids: [String(uid)], delete: true });
  assert.equal(soft.success, true);
  assert.equal((await env.messages('alice', 'Trash')).length, 1);
});

test('allow_delete=false blocks every kind of delete but not moves', { skip }, async () => {
  const uid = await env.seed('alice', { subject: 'Stay' });
  await call('folder_create', { name: 'Elsewhere' });
  const account = { account_name: 'alice_nodelete' };

  const soft = await call('emails_modify', { ...account, email_ids: [String(uid)], delete: true });
  assert.equal(soft.success, false);
  assert.match(soft.error, /ALLOW_DELETE/);
  assert.equal((await env.messages('alice')).length, 1);

  const moved = await call('emails_modify', { ...account, email_ids: [String(uid)], move_to_folder: 'Elsewhere' });
  assert.equal(moved.success, true);
});

test('accounts_list reports the safety switches', { skip }, async () => {
  const listed = await call('accounts_list');
  const byName = Object.fromEntries(listed.accounts.map((a) => [a.name, a]));
  assert.deepEqual(
    [byName.alice.read_only, byName.alice.allow_delete, byName.alice.allow_permanent_delete],
    [false, true, true]
  );
  assert.equal(byName.bob.read_only, true);
  assert.equal(byName.alice_safe.allow_permanent_delete, false);
  assert.equal(byName.alice_nodelete.allow_delete, false);
});

test('email_respond works from any folder and flags the original', { skip }, async () => {
  const uid = await env.seed('alice', { folder: 'Trash', subject: 'Filed away', from: 'bob@example.test' });

  const reply = await call('email_respond', { folder: 'Trash', email_id: String(uid), body: 'Thanks', body_type: 'plain' });
  assert.equal(reply.success, true);
  assert.equal(reply.original_flagged, true);
  assert.deepEqual((await env.messages('bob')).map((m) => m.subject), ['Re: Filed away']);
  let [original] = await env.messages('alice', 'Trash');
  assert.ok(original.flags.has('\\Answered'));
  assert.ok(!original.flags.has('$Forwarded'));

  const forward = await call('email_respond', {
    folder: 'Trash',
    email_id: String(uid),
    body: 'FYI',
    response_type: 'forward',
    to: ['bob@example.test'],
    body_type: 'plain'
  });
  assert.equal(forward.success, true);
  assert.equal(forward.original_flagged, true);
  [original] = await env.messages('alice', 'Trash');
  assert.ok(original.flags.has('\\Answered') && original.flags.has('$Forwarded'));

  const wrongFolder = await call('email_respond', { email_id: String(uid), body: 'x' });
  assert.equal(wrongFolder.success, false);
});

test('draft_update rewrites a draft and keeps what was not changed', { skip }, async () => {
  const created = await call('draft_create', {
    to: ['bob@example.test'],
    cc: ['carol@example.test'],
    subject: 'Plan',
    body: 'First version',
    body_type: 'plain',
    attachments: [{ filename: 'a.txt', content: Buffer.from('keep').toString('base64'), content_type: 'text/plain' }]
  });

  const updated = await call('draft_update', { email_id: created.email_id, body: 'Second version', cc: [] });
  assert.equal(updated.success, true);
  assert.equal(updated.previous_email_id, created.email_id);
  assert.notEqual(updated.email_id, created.email_id);

  const drafts = await env.messages('alice', 'Drafts');
  assert.equal(drafts.length, 1, 'old copy must be gone');
  const [draft] = drafts;
  assert.ok(draft.flags.has('\\Draft'));
  assert.equal(draft.subject, 'Plan');
  assert.match(draft.parsed.text, /Second version/);
  assert.equal(draft.parsed.to.value[0].address, 'bob@example.test');
  assert.equal(draft.parsed.cc, undefined);
  assert.equal(draft.parsed.attachments[0].filename, 'a.txt');
  assert.equal(String(draft.uid), updated.email_id);

  assert.equal((await call('draft_update', { email_id: updated.email_id })).success, false);
  assert.equal((await call('draft_update', { email_id: '9999', subject: 'x' })).success, false);
});

test('draft_send delivers the draft, keeps Bcc private and removes it', { skip }, async () => {
  const draft = await call('draft_create', {
    to: ['bob@example.test'],
    bcc: ['alice@example.test'],
    subject: 'Ready to go',
    body: '<p>Hello</p>',
    attachments: [{ filename: 'doc.txt', content: Buffer.from('payload').toString('base64'), content_type: 'text/plain' }]
  });

  const sent = await call('draft_send', { email_id: draft.email_id });
  assert.equal(sent.success, true);
  assert.equal(sent.draft_removed, true);
  assert.equal(sent.sent_copy.saved, true);

  assert.deepEqual(await env.messages('alice', 'Drafts'), []);
  const received = (await env.messages('bob')).find((m) => m.subject === 'Ready to go');
  assert.ok(received);
  assert.equal(received.parsed.attachments[0].filename, 'doc.txt');
  assert.equal(received.parsed.headers.get('bcc'), undefined, 'Bcc header must not reach recipients');
  assert.equal((await env.messages('alice', 'Sent')).length, 1);

  const noRecipient = await call('draft_create', { subject: 'Nobody', body: 'x', body_type: 'plain' });
  const refused = await call('draft_send', { email_id: noRecipient.email_id });
  assert.equal(refused.success, false);
  assert.match(refused.error, /no "to" recipients/);
  assert.equal((await env.messages('alice', 'Drafts')).length, 1);
});

test('draft_create as a reply threads onto the original', { skip }, async () => {
  const uid = await env.seed('alice', { folder: 'Trash', subject: 'Budget?', from: 'Bob <bob@example.test>', body: 'Numbers please' });

  const draft = await call('draft_create', { reply_to_email_id: String(uid), reply_to_folder: 'Trash', body: 'Attached soon.', body_type: 'plain' });
  assert.equal(draft.success, true);

  const [stored] = await env.messages('alice', 'Drafts');
  assert.equal(stored.subject, 'Re: Budget?');
  assert.equal(stored.parsed.to.value[0].address, 'bob@example.test');
  assert.ok(stored.parsed.inReplyTo);
  assert.match(stored.parsed.text, /Attached soon\./);
  assert.match(stored.parsed.text, /Numbers please/);

  const sent = await call('draft_send', { email_id: draft.email_id });
  assert.equal(sent.success, true);
  const [received] = await env.messages('bob');
  assert.equal(received.parsed.inReplyTo, stored.parsed.inReplyTo);

  const missing = await call('draft_create', { reply_to_email_id: '9999', body: 'x' });
  assert.equal(missing.success, false);
  const stray = await call('draft_create', { subject: 's', body: 'x', reply_all: true });
  assert.equal(stray.success, false);
});

test('draft_delete moves to Trash, permanent needs the permission', { skip }, async () => {
  const a = await call('draft_create', { subject: 'A', body: 'x', body_type: 'plain' });
  const b = await call('draft_create', { subject: 'B', body: 'x', body_type: 'plain' });

  const soft = await call('draft_delete', { email_ids: [a.email_id] });
  assert.equal(soft.success, true);
  assert.equal(soft.deleted_to, 'Trash');
  assert.deepEqual((await env.messages('alice', 'Trash')).map((m) => m.subject), ['A']);

  const locked = await call('draft_delete', { account_name: 'alice_safe', email_ids: [b.email_id], permanent: true });
  assert.equal(locked.success, false);
  assert.match(locked.error, /ALLOW_PERMANENT_DELETE/);
  assert.equal((await env.messages('alice', 'Drafts')).length, 1);

  const hard = await call('draft_delete', { email_ids: [b.email_id], permanent: true });
  assert.equal(hard.success, true);
  assert.deepEqual(await env.messages('alice', 'Drafts'), []);
});

test('attachments are listed with metadata and fetched one by one', { skip }, async () => {
  const binary = Buffer.from([0, 1, 2, 250, 251, 252, 255, 10, 13]);
  const uid = await env.seed('alice', {
    subject: 'Files',
    attachments: [
      { filename: 'report.txt', content: 'quarterly numbers', contentType: 'text/plain' },
      { filename: 'data.bin', content: binary, contentType: 'application/octet-stream' },
      { filename: 'Übersicht März.pdf', content: Buffer.from('%PDF-fake'), contentType: 'application/pdf' }
    ]
  });
  await env.seed('alice', { subject: 'Plain' });

  const found = await call('emails_find', { filters: { subject: 'Files' } });
  const [email] = found.emails;
  assert.equal(email.has_attachments, true);
  assert.equal(email.attachments, undefined, 'no inline content unless requested');
  assert.deepEqual(email.attachment_list.map((a) => a.filename), ['report.txt', 'data.bin', 'Übersicht März.pdf']);
  assert.equal(email.attachment_list[1].content_type, 'application/octet-stream');
  assert.ok(email.attachment_list.every((a) => a.part && a.size > 0));
  const plain = await call('emails_find', { filters: { subject: 'Plain' } });
  assert.equal(plain.emails[0].attachment_list, undefined);

  const byName = await call('attachment_get', { email_id: String(uid), filename: 'data.bin' });
  assert.equal(byName.success, true);
  assert.deepEqual(Buffer.from(byName.content, 'base64'), binary);
  assert.equal(byName.size, binary.length);

  const byPart = await call('attachment_get', { email_id: String(uid), part: email.attachment_list[0].part });
  assert.equal(Buffer.from(byPart.content, 'base64').toString(), 'quarterly numbers');
  assert.equal(byPart.filename, 'report.txt');

  const unicode = await call('attachment_get', { email_id: String(uid), filename: 'Übersicht März.pdf' });
  assert.equal(Buffer.from(unicode.content, 'base64').toString(), '%PDF-fake');

  const unknown = await call('attachment_get', { email_id: String(uid), filename: 'nope.txt' });
  assert.equal(unknown.success, false);
  assert.match(unknown.error, /data\.bin/);
  assert.equal((await call('attachment_get', { email_id: String(uid) })).success, false);
  assert.equal((await call('attachment_get', { email_id: '9999', filename: 'x' })).success, false);
});

test('attachment_get works from other folders and on read-only accounts', { skip }, async () => {
  const uid = await env.seed('bob', {
    folder: 'Trash',
    subject: 'Old file',
    attachments: [{ filename: 'old.txt', content: 'archived', contentType: 'text/plain' }]
  });
  const result = await call('attachment_get', { account_name: 'bob', folder: 'Trash', email_id: String(uid), filename: 'old.txt' });
  assert.equal(result.success, true);
  assert.equal(Buffer.from(result.content, 'base64').toString(), 'archived');
});

test('folders_list reports hierarchy, separator and special-use types', { skip }, async () => {
  await call('folder_create', { name: 'Projects' });
  await call('folder_create', { name: 'Projects/2026' });
  const { folders } = await call('folders_list');
  const byPath = Object.fromEntries(folders.map((f) => [f.path, f]));

  assert.equal(byPath.Sent.special_use, '\\Sent');
  assert.equal(byPath.Drafts.special_use, '\\Drafts');
  assert.equal(byPath.Trash.special_use, '\\Trash');
  assert.equal(byPath.Junk.special_use, '\\Junk');
  assert.equal(byPath.INBOX.special_use, '\\Inbox');
  assert.equal(byPath['Projects/2026'].delimiter, '/');
  assert.equal(byPath['Projects/2026'].parent, 'Projects');
  assert.equal(byPath['Projects/2026'].name, '2026');
  assert.equal(byPath.Projects.parent, undefined);
  assert.equal(byPath.Projects.subscribed, true);
});

test('folder_rename renames and moves folders with their messages', { skip }, async () => {
  await call('folder_create', { name: 'Old' });
  await call('folder_create', { name: 'Old/Sub' });
  await call('folder_create', { name: 'Archive' });
  await env.seed('alice', { folder: 'Old', subject: 'Inside old' });
  await env.seed('alice', { folder: 'Old/Sub', subject: 'Inside sub' });

  const renamed = await call('folder_rename', { name: 'Old', new_name: 'New' });
  assert.equal(renamed.success, true);
  assert.deepEqual([renamed.from, renamed.to], ['Old', 'New']);
  assert.deepEqual((await env.messages('alice', 'New')).map((m) => m.subject), ['Inside old']);
  assert.deepEqual((await env.messages('alice', 'New/Sub')).map((m) => m.subject), ['Inside sub']);
  assert.equal(await env.messages('alice', 'Old'), null);

  const moved = await call('folder_rename', { name: 'New', new_name: 'Archive/New' });
  assert.equal(moved.success, true);
  assert.deepEqual((await env.messages('alice', 'Archive/New/Sub')).map((m) => m.subject), ['Inside sub']);

  for (const [name, new_name] of [['INBOX', 'X'], ['Sent', 'Gesendet'], ['Missing', 'X'], ['Archive', 'Archive/New'], ['Archive', 'Archive']]) {
    assert.equal((await call('folder_rename', { name, new_name })).success, false, `${name} -> ${new_name}`);
  }
  assert.equal((await call('folder_rename', { account_name: 'bob', name: 'Archive', new_name: 'Z' })).success, false);
});

test('emails_modify copies messages and leaves the originals', { skip }, async () => {
  const uid = await env.seed('alice', { subject: 'Duplicate me', flags: ['\\Flagged'] });
  await call('folder_create', { name: 'Copies' });

  const copied = await call('emails_modify', { email_ids: [String(uid)], copy_to_folder: 'Copies' });
  assert.equal(copied.success, true);
  assert.equal(copied.modified, 1);
  assert.deepEqual((await env.messages('alice')).map((m) => m.subject), ['Duplicate me']);
  const [copy] = await env.messages('alice', 'Copies');
  assert.equal(copy.subject, 'Duplicate me');
  assert.ok(copy.flags.has('\\Flagged'));

  const missing = await call('emails_modify', { email_ids: [String(uid)], copy_to_folder: 'Nowhere' });
  assert.equal(missing.success, false);

  for (const extra of [{ move_to_folder: 'Copies' }, { delete: true }]) {
    const conflict = await call('emails_modify', { email_ids: [String(uid)], copy_to_folder: 'Copies', ...extra });
    assert.equal(conflict.success, false);
    assert.match(conflict.error, /cannot be combined/);
  }
  assert.equal((await env.messages('alice', 'Copies')).length, 1);
});

async function seedMany(count, make) {
  const uids = [];
  for (let i = 1; i <= count; i++) uids.push(await env.seed('alice', make(i)));
  return uids;
}

test('emails_find pages through results with offset and order', { skip }, async () => {
  await seedMany(7, (i) => ({ subject: `Mail ${i}` }));

  const first = await call('emails_find', { limit: 3 });
  assert.deepEqual(first.emails.map((e) => e.subject), ['Mail 7', 'Mail 6', 'Mail 5']);
  assert.equal(first.total_found, 7);
  assert.equal(first.has_more, true);
  assert.equal(first.next_offset, 3);

  const second = await call('emails_find', { limit: 3, offset: first.next_offset });
  assert.deepEqual(second.emails.map((e) => e.subject), ['Mail 4', 'Mail 3', 'Mail 2']);

  const last = await call('emails_find', { limit: 3, offset: 6 });
  assert.deepEqual(last.emails.map((e) => e.subject), ['Mail 1']);
  assert.equal(last.has_more, false);
  assert.equal(last.next_offset, undefined);

  const oldest = await call('emails_find', { limit: 2, order: 'oldest' });
  assert.deepEqual(oldest.emails.map((e) => e.subject), ['Mail 1', 'Mail 2']);

  const beyond = await call('emails_find', { offset: 50 });
  assert.equal(beyond.success, true);
  assert.deepEqual(beyond.emails, []);
  assert.equal(beyond.total_found, 7);

  assert.equal((await call('emails_find', { offset: -1 })).success, false);
  assert.equal((await call('emails_find', { order: 'sideways' })).success, false);
});

test('emails_find supports answered, forwarded, cc and size filters', { skip }, async () => {
  const small = await env.seed('alice', { subject: 'Small', flags: ['\\Answered'] });
  await env.seed('alice', { subject: 'Big', body: 'x'.repeat(20000), flags: ['$Forwarded'] });
  await env.withImap('alice', async (client) => {
    const lock = await client.getMailboxLock('INBOX');
    try {
      await client.append('INBOX', Buffer.from(
        'From: a@example.test\r\nTo: alice@example.test\r\nCc: watcher@example.test\r\nSubject: With cc\r\nMessage-ID: <cc@example.test>\r\nDate: ' + new Date().toUTCString() + '\r\n\r\nhi'
      ));
    } finally {
      lock.release();
    }
  });

  const subjects = async (filters) => (await call('emails_find', { filters })).emails.map((e) => e.subject).sort();
  assert.deepEqual(await subjects({ is_answered: true }), ['Small']);
  assert.deepEqual(await subjects({ is_answered: false }), ['Big', 'With cc']);
  assert.deepEqual(await subjects({ is_forwarded: true }), ['Big']);
  assert.deepEqual(await subjects({ is_forwarded: false }), ['Small', 'With cc']);
  assert.deepEqual(await subjects({ cc: 'watcher@example.test' }), ['With cc']);
  assert.deepEqual(await subjects({ min_size: 10000 }), ['Big']);
  assert.deepEqual(await subjects({ max_size: 10000 }), ['Small', 'With cc']);
  assert.equal((await call('emails_find', { filters: { min_size: -5 } })).success, false);
  assert.ok(small);
});

test('has_attachments filter pages correctly', { skip }, async () => {
  for (let i = 1; i <= 3; i++) {
    await env.seed('alice', { subject: `Plain ${i}` });
    await env.seed('alice', { subject: `Files ${i}`, attachments: [{ filename: `f${i}.txt`, content: 'data', contentType: 'text/plain' }] });
  }
  const page = await call('emails_find', { filters: { has_attachments: true }, limit: 2 });
  assert.deepEqual(page.emails.map((e) => e.subject), ['Files 3', 'Files 2']);
  assert.equal(page.total_found, 3);
  const rest = await call('emails_find', { filters: { has_attachments: true }, limit: 2, offset: 2 });
  assert.deepEqual(rest.emails.map((e) => e.subject), ['Files 1']);
  const without = await call('emails_find', { filters: { has_attachments: false } });
  assert.equal(without.total_found, 3);
});

test('bulk emails_modify needs a matching dry run and expected_count', { skip }, async () => {
  await seedMany(4, (i) => ({ subject: `Newsletter ${i}`, from: 'news@example.test' }));
  await seedMany(2, (i) => ({ subject: `Personal ${i}`, from: 'friend@example.test' }));
  await call('folder_create', { name: 'News' });
  const selection = { filters: { from: 'news@example.test' } };

  const dry = await call('emails_modify', { ...selection, dry_run: true });
  assert.equal(dry.success, true);
  assert.equal(dry.dry_run, true);
  assert.equal(dry.matched, 4);
  assert.equal(dry.sample.length, 4);
  assert.equal((await env.messages('alice')).length, 6, 'dry run must not change anything');

  const noCount = await call('emails_modify', { ...selection, move_to_folder: 'News' });
  assert.equal(noCount.success, false);
  assert.match(noCount.error, /expected_count: 4/);
  const wrongCount = await call('emails_modify', { ...selection, move_to_folder: 'News', expected_count: 3 });
  assert.equal(wrongCount.success, false);
  assert.match(wrongCount.error, /does not match/);
  assert.equal((await env.messages('alice')).length, 6);

  const done = await call('emails_modify', { ...selection, move_to_folder: 'News', expected_count: 4 });
  assert.equal(done.success, true);
  assert.equal(done.modified, 4);
  assert.equal((await env.messages('alice', 'News')).length, 4);
  assert.deepEqual((await env.messages('alice')).map((m) => m.subject).sort(), ['Personal 1', 'Personal 2']);

  const none = await call('emails_modify', { filters: { from: 'nobody@example.test' }, mark_read: true });
  assert.equal(none.success, true);
  assert.equal(none.modified, 0);

  const byQuery = await call('emails_modify', { query: 'Personal', mark_read: true, expected_count: 2 });
  assert.equal(byQuery.modified, 2);
  assert.ok((await env.messages('alice')).every((m) => m.flags.has('\\Seen')));
});

test('bulk emails_modify refuses unsafe selections', { skip }, async () => {
  const uid = await env.seed('alice', { subject: 'Anything' });
  const cases = [
    [{ filters: {}, mark_read: true }, /at least one filter/],
    [{ email_ids: [String(uid)], filters: { from: 'a' }, mark_read: true }, /not both/],
    [{ email_ids: [String(uid)], dry_run: true }, /only apply to filters/],
    [{ filters: { from: 'a' } }, /At least one modification/]
  ];
  for (const [args, pattern] of cases) {
    const result = await call('emails_modify', args);
    assert.equal(result.success, false);
    assert.match(result.error, pattern);
  }
  assert.equal((await call('emails_modify', { account_name: 'bob', filters: { from: 'a' }, delete: true, expected_count: 0 })).success, false);

  const locked = await call('emails_modify', { account_name: 'alice_safe', filters: { subject: 'Anything' }, delete: true, permanent: true, expected_count: 1 });
  assert.equal(locked.success, false);
  assert.match(locked.error, /ALLOW_PERMANENT_DELETE/);
  assert.equal((await env.messages('alice')).length, 1);

  const dry = await call('emails_modify', { account_name: 'bob', filters: { subject: 'x' }, dry_run: true });
  assert.equal(dry.success, true, 'dry run is a read and works on read-only accounts');
});

test('mark_spam moves to Junk and mark_not_spam brings it back', { skip }, async () => {
  const uid = await env.seed('alice', { subject: 'Win a prize' });

  const spam = await call('emails_modify', { email_ids: [String(uid)], mark_spam: true });
  assert.equal(spam.success, true);
  assert.equal(spam.moved_to, 'Junk');
  assert.deepEqual(await env.messages('alice'), []);
  const [junked] = await env.messages('alice', 'Junk');
  assert.equal(junked.subject, 'Win a prize');
  assert.ok(junked.flags.has('$Junk'));

  const ham = await call('emails_modify', { folder: 'Junk', email_ids: [String(junked.uid)], mark_not_spam: true });
  assert.equal(ham.success, true);
  assert.equal(ham.moved_to, 'INBOX');
  const [restored] = await env.messages('alice');
  assert.equal(restored.subject, 'Win a prize');
  assert.ok(restored.flags.has('$NotJunk') && !restored.flags.has('$Junk'));

  const conflict = await call('emails_modify', { email_ids: [String(restored.uid)], mark_spam: true, move_to_folder: 'Trash' });
  assert.equal(conflict.success, false);
  assert.equal((await call('emails_modify', { account_name: 'bob', email_ids: ['1'], mark_spam: true })).success, false);
});

test('folder_empty clears Trash or Junk only, and respects permissions', { skip }, async () => {
  await seedMany(3, (i) => ({ folder: 'Trash', subject: `Trash ${i}` }));
  await env.seed('alice', { folder: 'Junk', subject: 'Junk 1' });
  await env.seed('alice', { subject: 'Keep' });
  await call('folder_create', { name: 'Other' });

  for (const name of ['INBOX', 'Sent', 'Other', 'Missing']) {
    assert.equal((await call('folder_empty', { name })).success, false, `${name} must not be emptied`);
  }
  assert.equal((await call('folder_empty', { account_name: 'alice_safe', name: 'Trash' })).success, false);
  assert.equal((await call('folder_empty', { account_name: 'bob', name: 'Trash' })).success, false);
  assert.equal((await env.messages('alice', 'Trash')).length, 3);
  assert.equal((await call('folder_empty', { name: 'Trash', older_than_days: -1 })).success, false);

  const recent = await call('folder_empty', { name: 'Trash', older_than_days: 30 });
  assert.equal(recent.success, true);
  assert.equal(recent.deleted, 0, 'fresh messages are not older than 30 days');

  const emptied = await call('folder_empty', { name: 'Trash' });
  assert.equal(emptied.success, true);
  assert.deepEqual([emptied.folder, emptied.deleted], ['Trash', 3]);
  assert.deepEqual(await env.messages('alice', 'Trash'), []);
  assert.equal((await call('folder_empty', { name: 'Junk' })).deleted, 1);
  assert.equal((await env.messages('alice')).length, 1);
});

test('folders with umlauts work for drafts, search and moves', { skip }, async () => {
  const name = 'Entwürfe & Notizen';
  assert.equal((await call('folder_create', { name })).folder, name);
  const draft = await call('draft_create', { to: ['bob@example.test'], subject: 'Umlaut folder', body: 'x', body_type: 'plain', folder: name });
  assert.equal(draft.success, true, draft.error);
  assert.equal(draft.folder, name);
  assert.ok(draft.email_id);

  const found = await call('emails_find', { folder: name, filters: { subject: 'Umlaut folder' } });
  assert.equal(found.success, true, found.error);
  assert.equal(found.count, 1);

  const sent = await call('draft_send', { folder: name, email_id: draft.email_id });
  assert.equal(sent.success, true, sent.error);
  assert.equal((await call('emails_find', { folder: name })).count, 0);
  assert.deepEqual((await env.messages('bob')).map((m) => m.subject), ['Umlaut folder']);

  const renamed = await call('folder_rename', { name, new_name: 'Übrig' });
  assert.equal(renamed.success, true, renamed.error);
  assert.equal((await call('folder_delete', { name: 'Übrig' })).success, true);
});

test('send options reach the recipient as headers', { skip }, async () => {
  const sent = await call('email_send', {
    to: ['bob@example.test'],
    subject: 'With options',
    body: 'x',
    body_type: 'plain',
    reply_to: 'desk@example.test',
    priority: 'high',
    read_receipt: true,
    headers: { 'X-Ticket': '4711' }
  });
  assert.equal(sent.success, true, sent.error);

  const [mail] = await env.messages('bob');
  assert.equal(mail.parsed.replyTo.value[0].address, 'desk@example.test');
  assert.equal(mail.parsed.headers.get('priority'), 'high'); // mailparser's view of X-Priority/Importance
  assert.match(mail.parsed.headers.get('disposition-notification-to').text, /alice@example\.test/);
  assert.equal(mail.parsed.headers.get('x-ticket'), '4711');

  const sentCopy = (await env.messages('alice', 'Sent'))[0];
  assert.equal(sentCopy.parsed.headers.get('x-ticket'), '4711');
});

test('invalid send options are refused before anything is sent', { skip }, async () => {
  const base = { to: ['bob@example.test'], subject: 's', body: 'b' };
  const bad = [
    [{ headers: { Subject: 'nope' } }, /cannot be set/],
    [{ headers: { 'X-A': 'one\r\nBcc: evil@example.test' } }, /single-line/],
    [{ headers: { 'bad name': 'x' } }, /Invalid header name/],
    [{ headers: [] }, /must be an object/],
    [{ priority: 'urgent' }, /priority must be/],
    [{ reply_to: 'not an address' }, /reply_to/],
    [{ reply_to: 'a@b.test, c@d.test' }, /reply_to/],
    [{ read_receipt: 'yes' }, /read_receipt/]
  ];
  for (const [extra, pattern] of bad) {
    for (const tool of ['email_send', 'draft_create']) {
      const result = await call(tool, { ...base, ...extra });
      assert.equal(result.success, false, `${tool} ${JSON.stringify(extra)}`);
      assert.match(result.error, pattern);
    }
  }
  assert.deepEqual(await env.messages('bob'), []);
  assert.deepEqual(await env.messages('alice', 'Drafts'), []);
});

test('drafts keep send options across updates and carry them when sent', { skip }, async () => {
  const draft = await call('draft_create', {
    to: ['bob@example.test'],
    subject: 'Draft with options',
    body: 'v1',
    body_type: 'plain',
    reply_to: 'desk@example.test',
    priority: 'low',
    read_receipt: true,
    headers: { 'X-Ticket': '1', 'X-Team': 'ops' }
  });
  assert.equal(draft.success, true, draft.error);
  let [stored] = await env.messages('alice', 'Drafts');
  assert.equal(stored.parsed.replyTo.value[0].address, 'desk@example.test');
  assert.equal(stored.parsed.headers.get('priority'), 'low');

  // Changing only the body keeps everything else
  const bodyOnly = await call('draft_update', { email_id: draft.email_id, body: 'v2' });
  assert.equal(bodyOnly.success, true, bodyOnly.error);
  [stored] = await env.messages('alice', 'Drafts');
  assert.equal(stored.parsed.replyTo.value[0].address, 'desk@example.test');
  assert.equal(stored.parsed.headers.get('priority'), 'low');
  assert.ok(stored.parsed.headers.has('disposition-notification-to'));
  assert.equal(stored.parsed.headers.get('x-ticket'), '1');
  assert.equal(stored.parsed.headers.get('x-team'), 'ops');

  // Changing options replaces them; empty headers clear the custom ones
  const changed = await call('draft_update', { email_id: bodyOnly.email_id, priority: 'high', read_receipt: false, headers: { 'X-Ticket': '2' } });
  assert.equal(changed.success, true, changed.error);
  [stored] = await env.messages('alice', 'Drafts');
  assert.equal(stored.parsed.headers.get('priority'), 'high');
  assert.ok(!stored.parsed.headers.has('disposition-notification-to'));
  assert.equal(stored.parsed.headers.get('x-ticket'), '2');
  assert.ok(!stored.parsed.headers.has('x-team'));

  const sent = await call('draft_send', { email_id: changed.email_id });
  assert.equal(sent.success, true, sent.error);
  const [mail] = await env.messages('bob');
  assert.equal(mail.parsed.replyTo.value[0].address, 'desk@example.test');
  assert.equal(mail.parsed.headers.get('priority'), 'high');
  assert.equal(mail.parsed.headers.get('x-ticket'), '2');
});

test('custom keywords can be added, searched, listed and removed', { skip }, async () => {
  const a = await env.seed('alice', { subject: 'Invoice A' });
  const b = await env.seed('alice', { subject: 'Invoice B' });
  await env.seed('alice', { subject: 'Other' });

  const added = await call('emails_modify', { email_ids: [String(a), String(b)], add_keywords: ['Invoice', '$Followup'] });
  assert.equal(added.success, true, added.error);
  await call('emails_modify', { email_ids: [String(b)], add_keywords: ['Paid'] });

  const withInvoice = await call('emails_find', { filters: { keyword: 'Invoice' } });
  assert.deepEqual(withInvoice.emails.map((e) => e.subject).sort(), ['Invoice A', 'Invoice B']);
  const unpaid = await call('emails_find', { filters: { keyword: 'Invoice', no_keyword: 'Paid' } });
  assert.deepEqual(unpaid.emails.map((e) => e.subject), ['Invoice A']);
  assert.deepEqual(unpaid.emails[0].keywords, ['$Followup', 'Invoice']);
  const other = await call('emails_find', { filters: { subject: 'Other' } });
  assert.equal(other.emails[0].keywords, undefined);

  // Bulk by keyword, then remove
  const dry = await call('emails_modify', { filters: { keyword: '$Followup' }, dry_run: true });
  assert.equal(dry.matched, 2);
  const removed = await call('emails_modify', { filters: { keyword: '$Followup' }, remove_keywords: ['$Followup'], expected_count: 2 });
  assert.equal(removed.success, true, removed.error);
  assert.equal((await call('emails_find', { filters: { keyword: '$Followup' } })).total_found, 0);
  assert.equal((await call('emails_find', { filters: { keyword: 'Invoice' } })).total_found, 2);

  for (const keywords of [['has space'], ['\\Seen'], [''], [], ['x'.repeat(60)], 'Invoice']) {
    assert.equal((await call('emails_modify', { email_ids: [String(a)], add_keywords: keywords })).success, false, JSON.stringify(keywords));
  }
  const conflict = await call('emails_find', { filters: { keyword: 'Invoice', is_forwarded: true } });
  assert.equal(conflict.success, false);
  assert.equal((await call('emails_modify', { account_name: 'bob', email_ids: ['1'], add_keywords: ['X'] })).success, false);
});

async function countConnections(keepAlive, calls) {
  const logFile = path.join(os.tmpdir(), `imap-pool-${process.pid}-${keepAlive}.log`);
  await rm(logFile, { force: true });
  const local = new Client({ name: 'pool-test', version: '1.0.0' });
  await local.connect(new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve('build/index.js')],
    env: { PATH: process.env.PATH || '', IMAP_DEBUG_LOG: logFile, IMAP_KEEPALIVE_SECONDS: String(keepAlive), ...env.serverEnv() }
  }));
  try {
    for (let i = 0; i < calls; i++) {
      const result = JSON.parse((await local.callTool({ name: i % 2 ? 'folders_list' : 'emails_find', arguments: {} })).content[0].text);
      assert.equal(result.success, true, result.error);
    }
    // Two calls at once must queue on the shared connection, not break it
    const parallel = await Promise.all([1, 2, 3].map(() => local.callTool({ name: 'emails_find', arguments: { limit: 1 } })));
    for (const item of parallel) assert.equal(JSON.parse(item.content[0].text).success, true);
  } finally {
    await local.close();
  }
  const lines = (await readFile(logFile, 'utf8').catch(() => '')).split('\n').filter(Boolean);
  return new Set(lines.map((line) => JSON.parse(line.slice(line.indexOf('{'))).cid).filter(Boolean)).size;
}

test('IMAP connections are reused between calls unless keepalive is off', { skip }, async () => {
  await env.seed('alice', { subject: 'Pooling' });
  const pooled = await countConnections(30, 6);
  const unpooled = await countConnections(0, 6);
  assert.equal(pooled, 1, 'one connection serves all calls');
  assert.ok(unpooled >= 9, `without keepalive every call connects (saw ${unpooled})`);
});

test('a dropped connection is replaced transparently', { skip }, async () => {
  const first = await call('emails_find', {});
  assert.equal(first.success, true);
  // Kill all of alice's sessions on the server side
  execFileSync('docker', ['compose', '-p', `mcp-test-${process.pid}`, '-f', path.resolve('test/docker/compose.yml'), 'exec', '-T', 'dovecot', 'doveadm', 'kick', 'alice@example.test'], { stdio: 'ignore' });
  const second = await call('emails_find', {});
  assert.equal(second.success, true, second.error);
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('emails_wait times out quietly when nothing arrives', { skip }, async () => {
  await env.seed('alice', { subject: 'Old mail' });
  const started = Date.now();
  const result = await call('emails_wait', { timeout_seconds: 2 });
  assert.equal(result.success, true, result.error);
  assert.equal(result.timed_out, true);
  assert.deepEqual(result.emails, []);
  assert.ok(Date.now() - started >= 1800, 'waits for the timeout');
  assert.ok(result.next_uid > 1);
});

test('emails_wait returns as soon as matching mail arrives', { skip }, async () => {
  const started = Date.now();
  const waiting = call('emails_wait', { timeout_seconds: 60, filters: { from: 'wanted@example.test' } });
  await sleep(1000);
  await env.seed('alice', { subject: 'Not interesting', from: 'noise@example.test' });
  await sleep(500);
  await env.seed('alice', { subject: 'The reply', from: 'wanted@example.test', body: 'here you go' });

  const result = await waiting;
  assert.equal(result.success, true, result.error);
  assert.equal(result.timed_out, false);
  assert.deepEqual(result.emails.map((m) => m.subject), ['The reply']);
  assert.ok(Date.now() - started < 20000, `returned early (took ${Date.now() - started} ms)`);

  // Continue from next_uid: nothing new, then one more message
  const quiet = await call('emails_wait', { timeout_seconds: 1, since_uid: result.next_uid, filters: { from: 'wanted@example.test' } });
  assert.equal(quiet.timed_out, true);
  assert.deepEqual(quiet.emails, []);
  const later = call('emails_wait', { timeout_seconds: 30, since_uid: result.next_uid, include_content: true });
  await sleep(500);
  await env.seed('alice', { subject: 'Second', from: 'wanted@example.test', body: 'second body' });
  const second = await later;
  assert.deepEqual(second.emails.map((m) => m.subject), ['Second']);
  assert.match(second.emails[0].body, /second body/);
});

test('emails_wait sees mail delivered through SMTP and reports old mail via since_uid', { skip }, async () => {
  const oldUid = await env.seed('alice', { subject: 'Already there' });
  const immediate = await call('emails_wait', { timeout_seconds: 5, since_uid: oldUid });
  assert.equal(immediate.timed_out, false);
  assert.deepEqual(immediate.emails.map((m) => m.subject), ['Already there']);

  const waiting = call('emails_wait', { timeout_seconds: 30, filters: { subject: 'Via SMTP' } });
  await sleep(800);
  const sent = await call('email_send', { to: ['alice@example.test'], subject: 'Via SMTP', body: 'x', body_type: 'plain' });
  assert.equal(sent.success, true, sent.error);
  const result = await waiting;
  assert.deepEqual(result.emails.map((m) => m.subject), ['Via SMTP']);
});

test('emails_wait validates input and works on read-only accounts and other folders', { skip }, async () => {
  for (const args of [{ timeout_seconds: 0 }, { timeout_seconds: 500 }, { limit: 0 }, { since_uid: -1 }, { include_content: 'yes' }, { filters: { min_size: -1 } }]) {
    assert.equal((await call('emails_wait', args)).success, false, JSON.stringify(args));
  }
  assert.equal((await call('emails_wait', { folder: 'NoSuchFolder', timeout_seconds: 1 })).success, false);
  const readOnly = await call('emails_wait', { account_name: 'bob', timeout_seconds: 1 });
  assert.equal(readOnly.success, true, readOnly.error);
  const trash = await call('emails_wait', { folder: 'Trash', timeout_seconds: 1 });
  assert.equal(trash.success, true, trash.error);
});
