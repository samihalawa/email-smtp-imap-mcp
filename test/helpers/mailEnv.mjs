import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { SMTPServer } from 'smtp-server';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';

const composeFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../docker/compose.yml');
const DOMAIN = 'example.test';

export const USERS = {
  alice: { user: `alice@${DOMAIN}`, pass: 'alice-pass' },
  bob: { user: `bob@${DOMAIN}`, pass: 'bob-pass' }
};

export function dockerAvailable() {
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

export async function imapClient(user, port) {
  const client = new ImapFlow({
    host: '127.0.0.1',
    port,
    secure: false,
    auth: { user: user.user, pass: user.pass },
    logger: false
  });
  client.on('error', () => {});
  await client.connect();
  return client;
}

/**
 * Starts Dovecot in Docker plus an SMTP server that delivers accepted mail
 * into the recipients' INBOX (a stand-in for a real MTA with LMTP).
 */
export async function startMailEnv() {
  const imapPort = await freePort();
  const project = `mcp-test-${process.pid}`;
  const env = { ...process.env, TEST_IMAP_PORT: String(imapPort) };
  const compose = (...args) => execFileSync('docker', ['compose', '-p', project, '-f', composeFile, ...args], { env, stdio: 'pipe' });

  try {
    compose('up', '-d', '--wait', '--build');
  } catch (error) {
    try {
      compose('down', '-v', '--remove-orphans');
    } catch {}
    throw error;
  }

  const smtp = new SMTPServer({
    authOptional: true,
    disabledCommands: ['STARTTLS'],
    onAuth(auth, session, callback) {
      const known = Object.values(USERS).find((u) => u.user === auth.username && u.pass === auth.password);
      if (!known) return callback(new Error('Invalid credentials'));
      callback(null, { user: auth.username });
    },
    onData(stream, session, callback) {
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', async () => {
        const raw = Buffer.concat(chunks);
        try {
          for (const rcpt of session.envelope.rcptTo) {
            const user = Object.values(USERS).find((u) => u.user === rcpt.address.toLowerCase());
            if (!user) continue;
            const client = await imapClient(user, imapPort);
            try {
              await client.append('INBOX', raw);
            } finally {
              await client.logout();
            }
          }
          callback();
        } catch (error) {
          callback(error);
        }
      });
    }
  });
  await new Promise((resolve, reject) => {
    smtp.once('error', reject);
    smtp.listen(0, '127.0.0.1', resolve);
  });
  const smtpPort = smtp.server.address().port;

  const accountConfig = (user, extra = {}) => ({
    save_to_sent: true,
    ...extra,
    smtp: { host: '127.0.0.1', port: smtpPort, secure: false, user: user.user, password: user.pass },
    imap: { host: '127.0.0.1', port: imapPort, secure: false, user: user.user, password: user.pass }
  });

  return {
    imapPort,
    smtpPort,
    /**
     * alice: unrestricted; bob: read-only; alice_safe / alice_nodelete: alice's mailbox with the
     * default permanent-delete lock / with deleting disabled.
     */
    accounts: {
      alice: accountConfig(USERS.alice, { allow_permanent_delete: true }),
      bob: accountConfig(USERS.bob, { read_only: true }),
      alice_safe: accountConfig(USERS.alice),
      alice_nodelete: accountConfig(USERS.alice, { allow_delete: false })
    },
    /** Env for the MCP server process / account loader */
    serverEnv: (extra = {}) => ({
      EMAIL_ACCOUNTS_JSON: JSON.stringify({
        alice: accountConfig(USERS.alice, { allow_permanent_delete: true }),
        bob: accountConfig(USERS.bob, { read_only: true }),
        alice_safe: accountConfig(USERS.alice),
        alice_nodelete: accountConfig(USERS.alice, { allow_delete: false })
      }),
      DEFAULT_EMAIL_ACCOUNT: 'alice',
      ...extra
    }),
    /** Direct IMAP access for assertions and fixtures */
    async withImap(userKey, fn) {
      const client = await imapClient(USERS[userKey], imapPort);
      try {
        return await fn(client);
      } finally {
        await client.logout().catch(() => {});
      }
    },
    /** Put a message into a folder and return its UID */
    async seed(userKey, { folder = 'INBOX', subject, from = 'carol@example.test', to, body = 'seed body', flags = [], attachments }) {
      if (attachments) {
        const mail = new MailComposer({ from, to: to || USERS[userKey].user, subject, text: body, attachments, messageId: `<${Date.now()}-${Math.random().toString(16).slice(2)}@example.test>` });
        const built = await mail.compile().build();
        return this.withImap(userKey, async (client) => (await client.append(folder, built, flags)).uid);
      }
      const raw = [
        `Message-ID: <${Date.now()}-${Math.random().toString(16).slice(2)}@example.test>`,
        `From: ${from}`,
        `To: ${to || USERS[userKey].user}`,
        `Subject: ${subject}`,
        `Date: ${new Date().toUTCString()}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        body
      ].join('\r\n');
      return this.withImap(userKey, async (client) => {
        const result = await client.append(folder, Buffer.from(raw), flags);
        return result.uid;
      });
    },
    /** All messages of a folder as {uid, subject, flags, source} */
    async messages(userKey, folder = 'INBOX') {
      return this.withImap(userKey, async (client) => {
        const list = await client.list();
        if (!list.some((box) => box.path === folder)) return null;
        const lock = await client.getMailboxLock(folder);
        try {
          const out = [];
          if (client.mailbox.exists > 0) {
            for await (const message of client.fetch('1:*', { uid: true, flags: true, source: true })) {
              const parsed = await simpleParser(message.source);
              out.push({ uid: message.uid, subject: parsed.subject, flags: message.flags, parsed });
            }
          }
          return out;
        } finally {
          lock.release();
        }
      });
    },
    /** Remove everything the tests created so each test starts clean */
    async reset() {
      for (const key of Object.keys(USERS)) {
        await this.withImap(key, async (client) => {
          for (const box of await client.list()) {
            if (box.path === 'INBOX' || box.specialUse) {
              const lock = await client.getMailboxLock(box.path);
              try {
                if (client.mailbox.exists > 0) await client.messageDelete('1:*');
              } finally {
                lock.release();
              }
            } else {
              await client.mailboxDelete(box.path).catch(() => {});
            }
          }
        });
      }
    },
    async stop() {
      await new Promise((resolve) => smtp.close(resolve));
      try {
        compose('down', '-v', '--remove-orphans');
      } catch {}
    }
  };
}
