import { Client } from '@microsoft/microsoft-graph-client';
import fs from 'fs/promises';
import { EmailProvider } from './base.js';
import { Email, SearchOptions, SendOptions, Folder, OutlookConfig } from '../types.js';

const logger = {
  info: (...args: unknown[]) => console.error('[Outlook]', ...args),
  error: (...args: unknown[]) => console.error('[Outlook ERROR]', ...args),
};

interface OutlookToken {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export class OutlookProvider extends EmailProvider {
  readonly name = 'outlook';
  private client: Client | null = null;
  private config: OutlookConfig;
  private token: OutlookToken | null = null;

  constructor(config: OutlookConfig) {
    super();
    this.config = config;
  }

  async connect(): Promise<void> {
    const tokenContent = await fs.readFile(this.config.tokenPath, 'utf-8');
    this.token = JSON.parse(tokenContent);

    // Check if token needs refresh
    if (Date.now() >= this.token!.expires_at) {
      await this.refreshToken();
    }

    this.client = Client.init({
      authProvider: (done) => {
        done(null, this.token!.access_token);
      },
    });

    logger.info('Connected to Outlook');
  }

  private async refreshToken(): Promise<void> {
    if (!this.token) throw new Error('No token to refresh');

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      refresh_token: this.token.refresh_token,
      grant_type: 'refresh_token',
    });

    const response = await fetch(
      `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
      }
    );

    const data = await response.json();

    this.token = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || this.token.refresh_token,
      expires_at: Date.now() + data.expires_in * 1000,
    };

    await fs.writeFile(this.config.tokenPath, JSON.stringify(this.token, null, 2));
    logger.info('Token refreshed');
  }

  async disconnect(): Promise<void> {
    this.client = null;
  }

  private get api(): Client {
    if (!this.client) throw new Error('Not connected to Outlook');
    return this.client;
  }

  async fetchUnread(maxResults = 10): Promise<Email[]> {
    return this.search({ query: 'isRead eq false', maxResults });
  }

  async search(options: SearchOptions): Promise<Email[]> {
    const { query, maxResults = 10, folder = 'inbox' } = options;
    logger.info(`Searching: "${query || 'all'}"`);

    let request = this.api
      .api(`/me/mailFolders/${folder}/messages`)
      .top(maxResults)
      .select('id,subject,from,toRecipients,ccRecipients,bodyPreview,body,receivedDateTime,isRead,hasAttachments');

    if (query) {
      request = request.filter(query);
    }

    const response = await request.get();

    return response.value.map((msg: any) => this.mapMessage(msg));
  }

  private mapMessage(msg: any): Email {
    return {
      id: msg.id,
      from: msg.from?.emailAddress?.address || '',
      to: msg.toRecipients?.map((r: any) => r.emailAddress?.address) || [],
      cc: msg.ccRecipients?.map((r: any) => r.emailAddress?.address),
      subject: msg.subject || '',
      snippet: msg.bodyPreview || '',
      body: msg.body?.contentType === 'text' ? msg.body.content : '',
      bodyHtml: msg.body?.contentType === 'html' ? msg.body.content : '',
      date: new Date(msg.receivedDateTime),
      isUnread: !msg.isRead,
      hasAttachments: msg.hasAttachments || false,
    };
  }

  async getMessage(id: string): Promise<Email | null> {
    const msg = await this.api
      .api(`/me/messages/${id}`)
      .select('id,subject,from,toRecipients,ccRecipients,bodyPreview,body,receivedDateTime,isRead,hasAttachments')
      .get();

    return this.mapMessage(msg);
  }

  async markAsRead(id: string): Promise<void> {
    await this.api.api(`/me/messages/${id}`).patch({ isRead: true });
  }

  async markAsUnread(id: string): Promise<void> {
    await this.api.api(`/me/messages/${id}`).patch({ isRead: false });
  }

  async sendEmail(options: SendOptions): Promise<string> {
    const { to, cc, bcc, subject, body, isHtml } = options;

    const message = {
      subject,
      body: {
        contentType: isHtml ? 'HTML' : 'Text',
        content: body,
      },
      toRecipients: to.map((email) => ({ emailAddress: { address: email } })),
      ccRecipients: cc?.map((email) => ({ emailAddress: { address: email } })),
      bccRecipients: bcc?.map((email) => ({ emailAddress: { address: email } })),
    };

    await this.api.api('/me/sendMail').post({ message });
    logger.info('Email sent');
    return 'sent';
  }

  async getFolders(): Promise<Folder[]> {
    const response = await this.api
      .api('/me/mailFolders')
      .select('id,displayName,unreadItemCount')
      .get();

    return response.value.map((f: any) => ({
      id: f.id,
      name: f.displayName,
      unreadCount: f.unreadItemCount,
    }));
  }

  async deleteEmail(id: string): Promise<void> {
    await this.api.api(`/me/messages/${id}`).delete();
  }

  async moveEmail(id: string, folderId: string): Promise<void> {
    await this.api.api(`/me/messages/${id}/move`).post({ destinationId: folderId });
  }
}
