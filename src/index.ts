#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { AccountManager } from './account-manager.js';

const logger = {
  info: (...args: unknown[]) => console.error('[MCP]', ...args),
  error: (...args: unknown[]) => console.error('[MCP ERROR]', ...args),
};

// Initialize account manager
const ACCOUNTS_PATH = process.env.ACCOUNTS_PATH || '/app/credentials/accounts.json';
const manager = new AccountManager();

logger.info('Starting MCP Email Server (Multi-Account)...');
await manager.loadAccounts(ACCOUNTS_PATH);

// Create MCP Server
const server = new Server(
  { name: 'mcp-email-server', version: '2.0.0' },
  { capabilities: { tools: {} } }
);

// Define tools
const TOOLS: Tool[] = [
  {
    name: 'list_accounts',
    description: 'List all connected email accounts',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'fetch_unread_emails',
    description: 'Fetch unread emails from ALL accounts (unified inbox)',
    inputSchema: {
      type: 'object',
      properties: {
        maxResultsPerAccount: { type: 'number', description: 'Max emails per account (default: 10)' },
        accountId: { type: 'string', description: 'Optional: fetch from specific account only' },
      },
    },
  },
  {
    name: 'search_emails',
    description: 'Search emails across ALL accounts',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        maxResults: { type: 'number', description: 'Max results per account' },
        accountId: { type: 'string', description: 'Optional: search specific account only' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_email',
    description: 'Get full email content (requires accountId from list results)',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'Account ID the email belongs to' },
        emailId: { type: 'string', description: 'Email ID' },
      },
      required: ['accountId', 'emailId'],
    },
  },
  {
    name: 'mark_as_read',
    description: 'Mark email as read',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'Account ID' },
        emailId: { type: 'string', description: 'Email ID' },
      },
      required: ['accountId', 'emailId'],
    },
  },
  {
    name: 'mark_as_unread',
    description: 'Mark email as unread',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'Account ID' },
        emailId: { type: 'string', description: 'Email ID' },
      },
      required: ['accountId', 'emailId'],
    },
  },
  {
    name: 'send_email',
    description: 'Send email from a specific account',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'Account to send from (uses default if not specified)' },
        to: { type: 'array', items: { type: 'string' }, description: 'Recipients' },
        subject: { type: 'string', description: 'Subject' },
        body: { type: 'string', description: 'Body' },
        cc: { type: 'array', items: { type: 'string' }, description: 'CC' },
        bcc: { type: 'array', items: { type: 'string' }, description: 'BCC' },
        isHtml: { type: 'boolean', description: 'HTML email' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'get_all_folders',
    description: 'Get folders from all accounts',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'delete_email',
    description: 'Delete/trash an email',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'Account ID' },
        emailId: { type: 'string', description: 'Email ID' },
      },
      required: ['accountId', 'emailId'],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  logger.info(`Tool: ${name}`);

  try {
    let result: string;

    switch (name) {
      case 'list_accounts': {
        const accounts = manager.getAccounts();
        result = JSON.stringify(accounts, null, 2);
        break;
      }

      case 'fetch_unread_emails': {
        const maxResults = (args?.maxResultsPerAccount as number) || 10;
        const accountId = args?.accountId as string | undefined;

        let emails;
        if (accountId) {
          // Single account
          const acc = manager.getProvider(accountId);
          const rawEmails = await acc.provider.fetchUnread(maxResults);
          emails = rawEmails.map((e) => ({
            ...e,
            accountId,
            accountName: acc.config.name,
          }));
        } else {
          // All accounts
          emails = await manager.fetchAllUnread(maxResults);
        }

        result = JSON.stringify(
          emails.map((e) => ({
            accountId: e.accountId,
            accountName: e.accountName,
            id: e.id,
            from: e.from,
            subject: e.subject,
            snippet: e.snippet,
            date: e.date,
            hasAttachments: e.hasAttachments,
          })),
          null,
          2
        );
        break;
      }

      case 'search_emails': {
        const query = args?.query as string;
        const maxResults = (args?.maxResults as number) || 10;
        const accountId = args?.accountId as string | undefined;

        let emails;
        if (accountId) {
          const acc = manager.getProvider(accountId);
          const rawEmails = await acc.provider.search({ query, maxResults });
          emails = rawEmails.map((e) => ({
            ...e,
            accountId,
            accountName: acc.config.name,
          }));
        } else {
          emails = await manager.searchAll({ query, maxResults });
        }

        result = JSON.stringify(
          emails.map((e) => ({
            accountId: e.accountId,
            accountName: e.accountName,
            id: e.id,
            from: e.from,
            subject: e.subject,
            snippet: e.snippet,
            date: e.date,
          })),
          null,
          2
        );
        break;
      }

      case 'get_email': {
        const email = await manager.getMessage(args?.accountId as string, args?.emailId as string);
        result = JSON.stringify(email, null, 2);
        break;
      }

      case 'mark_as_read': {
        await manager.markAsRead(args?.accountId as string, args?.emailId as string);
        result = `Email marked as read`;
        break;
      }

      case 'mark_as_unread': {
        await manager.markAsUnread(args?.accountId as string, args?.emailId as string);
        result = `Email marked as unread`;
        break;
      }

      case 'send_email': {
        const id = await manager.sendEmail(args?.accountId as string | undefined, {
          to: args?.to as string[],
          subject: args?.subject as string,
          body: args?.body as string,
          cc: args?.cc as string[],
          bcc: args?.bcc as string[],
          isHtml: args?.isHtml as boolean,
        });
        result = `Email sent. ID: ${id}`;
        break;
      }

      case 'get_all_folders': {
        const folders = await manager.getAllFolders();
        result = JSON.stringify(folders, null, 2);
        break;
      }

      case 'delete_email': {
        await manager.deleteEmail(args?.accountId as string, args?.emailId as string);
        result = `Email deleted`;
        break;
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return { content: [{ type: 'text', text: result }] };
  } catch (error) {
    logger.error(`Error:`, error);
    return {
      content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown'}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
logger.info('MCP Email Server (Multi-Account) running');
