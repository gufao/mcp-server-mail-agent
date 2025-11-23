import Imap from 'imap';
import { simpleParser, ParsedMail } from 'mailparser';
import nodemailer from 'nodemailer';
import { EmailProvider } from './base.js';
import { Email, SearchOptions, SendOptions, Folder, IMAPConfig } from '../types.js';

const logger = {
  info: (...args: unknown[]) => console.error('[IMAP]', ...args),
  error: (...args: unknown[]) => console.error('[IMAP ERROR]', ...args),
};

export class IMAPProvider extends EmailProvider {
  readonly name = 'imap';
  private imap: Imap | null = null;
  private transporter: nodemailer.Transporter | null = null;
  private config: IMAPConfig;

  constructor(config: IMAPConfig) {
    super();
    this.config = config;
  }

  async connect(): Promise<void> {
    // IMAP connection
    this.imap = new Imap({
      user: this.config.user,
      password: this.config.password,
      host: this.config.host,
      port: this.config.port,
      tls: this.config.tls,
      tlsOptions: { rejectUnauthorized: false },
    });

    await new Promise<void>((resolve, reject) => {
      this.imap!.once('ready', () => resolve());
      this.imap!.once('error', reject);
      this.imap!.connect();
    });

    // SMTP transporter for sending
    this.transporter = nodemailer.createTransport({
      host: this.config.smtpHost,
      port: this.config.smtpPort,
      secure: this.config.smtpSecure,
      auth: {
        user: this.config.user,
        pass: this.config.password,
      },
    });

    logger.info(`Connected to ${this.config.host}`);
  }

  async disconnect(): Promise<void> {
    if (this.imap) {
      this.imap.end();
      this.imap = null;
    }
    this.transporter = null;
  }

  private get api(): Imap {
    if (!this.imap) throw new Error('Not connected to IMAP');
    return this.imap;
  }

  private openBox(name: string, readOnly = true): Promise<Imap.Box> {
    return new Promise((resolve, reject) => {
      this.api.openBox(name, readOnly, (err, box) => {
        if (err) reject(err);
        else resolve(box);
      });
    });
  }

  private searchMessages(criteria: any[]): Promise<number[]> {
    return new Promise((resolve, reject) => {
      this.api.search(criteria, (err, uids) => {
        if (err) reject(err);
        else resolve(uids || []);
      });
    });
  }

  private fetchMessage(uid: number): Promise<Email> {
    return new Promise((resolve, reject) => {
      const fetch = this.api.fetch([uid], {
        bodies: '',
        struct: true,
      });

      fetch.on('message', (msg) => {
        let buffer = '';

        msg.on('body', (stream) => {
          stream.on('data', (chunk: Buffer) => (buffer += chunk.toString('utf8')));
        });

        msg.once('end', async () => {
          try {
            const parsed = await simpleParser(buffer);
            resolve(this.mapMessage(uid.toString(), parsed));
          } catch (e) {
            reject(e);
          }
        });
      });

      fetch.once('error', reject);
    });
  }

  private mapMessage(id: string, parsed: ParsedMail): Email {
    return {
      id,
      from: parsed.from?.text || '',
      to: parsed.to ? (Array.isArray(parsed.to) ? parsed.to.map((t) => t.text) : [parsed.to.text]) : [],
      cc: parsed.cc ? (Array.isArray(parsed.cc) ? parsed.cc.map((c) => c.text) : [parsed.cc.text]) : undefined,
      subject: parsed.subject || '',
      snippet: (parsed.text || '').substring(0, 200),
      body: parsed.text || '',
      bodyHtml: parsed.html || undefined,
      date: parsed.date || new Date(),
      isUnread: true, // IMAP doesn't easily expose this in fetch
      hasAttachments: (parsed.attachments?.length || 0) > 0,
    };
  }

  async fetchUnread(maxResults = 10): Promise<Email[]> {
    await this.openBox('INBOX');
    const uids = await this.searchMessages(['UNSEEN']);
    const limitedUids = uids.slice(-maxResults).reverse();

    const emails: Email[] = [];
    for (const uid of limitedUids) {
      emails.push(await this.fetchMessage(uid));
    }
    return emails;
  }

  async search(options: SearchOptions): Promise<Email[]> {
    const { query, maxResults = 10, folder = 'INBOX' } = options;
    await this.openBox(folder);

    let criteria: any[] = ['ALL'];
    if (query) {
      // Simple query parsing
      if (query.includes('from:')) {
        const from = query.match(/from:(\S+)/)?.[1];
        if (from) criteria = [['FROM', from]];
      } else if (query.includes('subject:')) {
        const subject = query.match(/subject:(.+)/)?.[1];
        if (subject) criteria = [['SUBJECT', subject]];
      } else if (query === 'is:unread' || query === 'UNSEEN') {
        criteria = ['UNSEEN'];
      } else {
        criteria = [['TEXT', query]];
      }
    }

    const uids = await this.searchMessages(criteria);
    const limitedUids = uids.slice(-maxResults).reverse();

    const emails: Email[] = [];
    for (const uid of limitedUids) {
      emails.push(await this.fetchMessage(uid));
    }
    return emails;
  }

  async getMessage(id: string): Promise<Email | null> {
    await this.openBox('INBOX');
    return this.fetchMessage(parseInt(id));
  }

  async markAsRead(id: string): Promise<void> {
    await this.openBox('INBOX', false);
    await new Promise<void>((resolve, reject) => {
      this.api.addFlags([parseInt(id)], ['\\Seen'], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async markAsUnread(id: string): Promise<void> {
    await this.openBox('INBOX', false);
    await new Promise<void>((resolve, reject) => {
      this.api.delFlags([parseInt(id)], ['\\Seen'], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async sendEmail(options: SendOptions): Promise<string> {
    if (!this.transporter) throw new Error('SMTP not configured');

    const { to, cc, bcc, subject, body, isHtml } = options;

    const info = await this.transporter.sendMail({
      from: this.config.user,
      to: to.join(', '),
      cc: cc?.join(', '),
      bcc: bcc?.join(', '),
      subject,
      [isHtml ? 'html' : 'text']: body,
    });

    logger.info(`Sent: ${info.messageId}`);
    return info.messageId;
  }

  async getFolders(): Promise<Folder[]> {
    return new Promise((resolve, reject) => {
      this.api.getBoxes((err, boxes) => {
        if (err) reject(err);
        else {
          const folders: Folder[] = [];
          const traverse = (obj: any, prefix = '') => {
            for (const [name, box] of Object.entries(obj) as any) {
              folders.push({ id: prefix + name, name: prefix + name });
              if (box.children) traverse(box.children, prefix + name + box.delimiter);
            }
          };
          traverse(boxes);
          resolve(folders);
        }
      });
    });
  }

  async deleteEmail(id: string): Promise<void> {
    await this.openBox('INBOX', false);
    await new Promise<void>((resolve, reject) => {
      this.api.addFlags([parseInt(id)], ['\\Deleted'], (err) => {
        if (err) reject(err);
        else {
          this.api.expunge((expErr) => {
            if (expErr) reject(expErr);
            else resolve();
          });
        }
      });
    });
  }
}
