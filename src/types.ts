export interface Email {
  id: string;
  threadId?: string;
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  snippet: string;
  body: string;
  bodyHtml?: string;
  date: Date;
  isUnread: boolean;
  labels?: string[];
  hasAttachments: boolean;
}

export interface SearchOptions {
  query?: string;
  maxResults?: number;
  folder?: string;
}

export interface SendOptions {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  isHtml?: boolean;
  replyTo?: string;
}

export interface Folder {
  id: string;
  name: string;
  unreadCount?: number;
}

export type ProviderType = 'gmail' | 'outlook' | 'imap';

// Multi-account types
export interface AccountConfig {
  id: string;
  name: string;
  provider: ProviderType;
  default?: boolean;
  config: GmailConfig | OutlookConfig | IMAPConfig;
}

export interface GmailConfig {
  credentialsPath: string;
  tokenPath: string;
}

export interface OutlookConfig {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  tokenPath: string;
}

export interface IMAPConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  tls: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
}

export interface AccountsFile {
  accounts: AccountConfig[];
}

// Extended Email with account info
export interface UnifiedEmail extends Email {
  accountId: string;
  accountName: string;
  providerType: ProviderType;
}
