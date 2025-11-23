import { google, gmail_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import fs from 'fs/promises';
import { EmailProvider } from './base.js';
import { Email, SearchOptions, SendOptions, Folder, GmailConfig } from '../types.js';

const logger = {
  info: (...args: unknown[]) => console.error('[Gmail]', ...args),
  error: (...args: unknown[]) => console.error('[Gmail ERROR]', ...args),
};

export class GmailProvider extends EmailProvider {
  readonly name = 'gmail';
  private gmail: gmail_v1.Gmail | null = null;
  private config: GmailConfig;

  constructor(config: GmailConfig) {
    super();
    this.config = config;
  }

  async connect(): Promise<void> {
    const tokenContent = await fs.readFile(this.config.tokenPath, 'utf-8');
    const credentials = JSON.parse(tokenContent);
    const auth = google.auth.fromJSON(credentials) as OAuth2Client;
    this.gmail = google.gmail({ version: 'v1', auth });
    logger.info('Connected to Gmail');
  }

  async disconnect(): Promise<void> {
    this.gmail = null;
  }

  private get api(): gmail_v1.Gmail {
    if (!this.gmail) throw new Error('Not connected to Gmail');
    return this.gmail;
  }

  async fetchUnread(maxResults = 10): Promise<Email[]> {
    return this.search({ query: 'is:unread', maxResults });
  }

  async search(options: SearchOptions): Promise<Email[]> {
    const { query = '', maxResults = 10 } = options;
    logger.info(`Searching: "${query}"`);

    const response = await this.api.users.messages.list({
      userId: 'me',
      q: query,
      maxResults,
    });

    const messages = response.data.messages || [];
    const emails: Email[] = [];

    for (const msg of messages) {
      const email = await this.getMessage(msg.id!);
      if (email) emails.push(email);
    }

    return emails;
  }

  async getMessage(id: string): Promise<Email | null> {
    const response = await this.api.users.messages.get({
      userId: 'me',
      id,
      format: 'full',
    });

    const msg = response.data;
    const headers = msg.payload?.headers || [];

    const getHeader = (name: string): string =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

    let body = '';
    let bodyHtml = '';

    if (msg.payload?.body?.data) {
      body = Buffer.from(msg.payload.body.data, 'base64').toString('utf-8');
    } else if (msg.payload?.parts) {
      for (const part of msg.payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          body = Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
        if (part.mimeType === 'text/html' && part.body?.data) {
          bodyHtml = Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
      }
    }

    return {
      id: msg.id!,
      threadId: msg.threadId!,
      from: getHeader('From'),
      to: getHeader('To').split(',').map((s) => s.trim()),
      cc: getHeader('Cc') ? getHeader('Cc').split(',').map((s) => s.trim()) : undefined,
      subject: getHeader('Subject'),
      snippet: msg.snippet || '',
      body,
      bodyHtml,
      date: new Date(parseInt(msg.internalDate!)),
      isUnread: msg.labelIds?.includes('UNREAD') || false,
      labels: msg.labelIds || [],
      hasAttachments: msg.payload?.parts?.some((p) => p.filename) || false,
    };
  }

  async markAsRead(id: string): Promise<void> {
    await this.api.users.messages.modify({
      userId: 'me',
      id,
      requestBody: { removeLabelIds: ['UNREAD'] },
    });
  }

  async markAsUnread(id: string): Promise<void> {
    await this.api.users.messages.modify({
      userId: 'me',
      id,
      requestBody: { addLabelIds: ['UNREAD'] },
    });
  }

  async sendEmail(options: SendOptions): Promise<string> {
    const { to, cc, bcc, subject, body, isHtml } = options;

    const messageParts = [
      `To: ${to.join(', ')}`,
      cc?.length ? `Cc: ${cc.join(', ')}` : '',
      bcc?.length ? `Bcc: ${bcc.join(', ')}` : '',
      `Subject: ${subject}`,
      `Content-Type: ${isHtml ? 'text/html' : 'text/plain'}; charset=utf-8`,
      '',
      body,
    ].filter(Boolean);

    const raw = Buffer.from(messageParts.join('\r\n'))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await this.api.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });

    logger.info(`Sent email: ${response.data.id}`);
    return response.data.id!;
  }

  async getFolders(): Promise<Folder[]> {
    const response = await this.api.users.labels.list({ userId: 'me' });
    return (response.data.labels || []).map((l) => ({
      id: l.id!,
      name: l.name!,
      unreadCount: l.messagesUnread ?? undefined,
    }));
  }

  async deleteEmail(id: string): Promise<void> {
    await this.api.users.messages.trash({ userId: 'me', id });
  }
}
