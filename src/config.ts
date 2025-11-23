import { ProviderType } from './types.js';

export interface Config {
  provider: ProviderType;
  gmail: {
    credentialsPath: string;
    tokenPath: string;
  };
  outlook: {
    clientId: string;
    clientSecret: string;
    tenantId: string;
    tokenPath: string;
  };
  imap: {
    host: string;
    port: number;
    user: string;
    password: string;
    tls: boolean;
    smtpHost: string;
    smtpPort: number;
    smtpSecure: boolean;
  };
}

export function loadConfig(): Config {
  return {
    provider: (process.env.EMAIL_PROVIDER as ProviderType) || 'gmail',
    gmail: {
      credentialsPath: process.env.GMAIL_CREDENTIALS_PATH || './credentials/gmail-credentials.json',
      tokenPath: process.env.GMAIL_TOKEN_PATH || './credentials/gmail-token.json',
    },
    outlook: {
      clientId: process.env.OUTLOOK_CLIENT_ID || '',
      clientSecret: process.env.OUTLOOK_CLIENT_SECRET || '',
      tenantId: process.env.OUTLOOK_TENANT_ID || 'common',
      tokenPath: process.env.OUTLOOK_TOKEN_PATH || './credentials/outlook-token.json',
    },
    imap: {
      host: process.env.IMAP_HOST || '',
      port: parseInt(process.env.IMAP_PORT || '993'),
      user: process.env.IMAP_USER || '',
      password: process.env.IMAP_PASSWORD || '',
      tls: process.env.IMAP_TLS !== 'false',
      smtpHost: process.env.SMTP_HOST || '',
      smtpPort: parseInt(process.env.SMTP_PORT || '587'),
      smtpSecure: process.env.SMTP_SECURE === 'true',
    },
  };
}
