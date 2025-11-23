# MCP Email Server

A **Model Context Protocol (MCP) server** for email management supporting multiple providers and accounts with a unified inbox.

## Features

- **Multi-Provider**: Gmail (OAuth2), Outlook (Microsoft Graph), and any IMAP server
- **Multi-Account**: Unified inbox across all your email accounts
- **Security-First**: Secrets must use environment variables (plaintext rejected)
- **Docker-Ready**: Runs in a container for security and portability
- **MCP Standard**: Works with Claude Code, Claude Desktop, and any MCP-compatible client

## Supported Providers

| Provider | Auth Method | Features |
|----------|-------------|----------|
| Gmail | OAuth2 | Full Gmail API access |
| Outlook | OAuth2 | Microsoft Graph API |
| IMAP | App Password | Any email server (Gmail, Yahoo, iCloud, custom) |

## Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/augustolinhares/mcp-email-server.git
cd mcp-email-server
npm install
```

### 2. Configure

```bash
# Create credentials directory
mkdir -p credentials

# Copy example files
cp accounts.example.json credentials/accounts.json
cp .env.example .env

# Edit with your settings
nano credentials/accounts.json
nano .env
```

### 3. Set Up Provider

#### IMAP (Easiest - works with any email)

Edit `.env`:
```bash
IMAP_HOST=imap.gmail.com
IMAP_USER=your@gmail.com
IMAP_PASSWORD=your-app-password
SMTP_HOST=smtp.gmail.com
```

Edit `credentials/accounts.json`:
```json
{
  "accounts": [
    {
      "id": "main",
      "name": "My Email",
      "provider": "imap",
      "default": true,
      "config": {
        "host": "${IMAP_HOST}",
        "port": 993,
        "user": "${IMAP_USER}",
        "password": "${IMAP_PASSWORD}",
        "tls": true,
        "smtpHost": "${SMTP_HOST}",
        "smtpPort": 587,
        "smtpSecure": false
      }
    }
  ]
}
```

#### Gmail (OAuth2)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create project, enable Gmail API
3. Create OAuth credentials (Desktop app)
4. Download as `credentials/gmail-credentials.json`
5. Run: `npm run auth:gmail`

#### Outlook (OAuth2)

1. Go to [Azure Portal](https://portal.azure.com) > App registrations
2. New registration > Set redirect URI: `http://localhost:3000/callback`
3. Add API permissions: `Mail.Read`, `Mail.Send`, `Mail.ReadWrite`, `offline_access`
4. Create client secret
5. Set env vars and run: `npm run auth:outlook`

### 4. Build & Test

```bash
# Build
npm run build

# Test locally
source .env && ACCOUNTS_PATH=./credentials/accounts.json node dist/index.js

# Build Docker
docker build -t mcp-email-server .

# Test Docker
docker run --rm -v "$(pwd)/credentials:/app/credentials:ro" --env-file .env mcp-email-server
```

### 5. Add to Docker MCP Gateway

Add to `~/.docker/mcp/catalogs/custom.yaml`:
```yaml
  email:
    description: "Multi-account Email MCP Server supporting IMAP, Gmail, and Outlook"
    title: "Email Manager"
    type: server
    dateAdded: "2025-11-23T00:00:00Z"
    image: mcp-email-server:latest
    ref: ""
    tools:
      - name: list_accounts
      - name: fetch_unread_emails
      - name: search_emails
      - name: get_email
      - name: mark_as_read
      - name: mark_as_unread
      - name: send_email
      - name: get_all_folders
      - name: delete_email
    prompts: 0
    resources: {}
    volumes:
      - "/path/to/credentials:/app/credentials:ro"
    env:
      - name: ACCOUNTS_PATH
        value: "/app/credentials/accounts.json"
      - name: IMAP_HOST
        value: "your-imap-server.com"
      - name: IMAP_USER
        value: "your-email@example.com"
      - name: IMAP_PASSWORD
        value: "your-app-password"
      - name: SMTP_HOST
        value: "your-smtp-server.com"
    metadata:
      category: productivity
      tags:
        - email
        - imap
        - gmail
        - outlook
      license: GPL-3.0
      owner: local
```

> **Important:** The `env` field must be an array of `{name, value}` objects. Docker MCP Gateway does NOT support `${VAR}` syntax for environment variables - you must provide the actual values directly in the catalog file.

Add to `~/.docker/mcp/registry.yaml`:
```yaml
registry:
  email:
    ref: ""
```

Then run `/mcp` in Claude Code to reconnect, or restart Claude Desktop.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_accounts` | List all connected email accounts |
| `fetch_unread_emails` | Get unread emails (all accounts or specific) |
| `search_emails` | Search across all accounts |
| `get_email` | Get full email content by ID |
| `mark_as_read` | Mark email as read |
| `mark_as_unread` | Mark email as unread |
| `send_email` | Send email from specific account |
| `get_all_folders` | List folders from all accounts |
| `delete_email` | Delete/trash an email |

## Security

### Enforced Security

- **Plaintext secrets rejected**: The server will refuse to start if `password` or `clientSecret` are hardcoded in `accounts.json`
- **Environment variables required**: All secrets must use `${VAR_NAME}` syntax
- **Validation on startup**: Missing or empty secrets are reported

### Best Practices

- Never commit `.env` or `credentials/` to git (already in `.gitignore`)
- Use app passwords instead of regular passwords for IMAP
- Docker volumes are mounted read-only
- Container runs as non-root user

## Common IMAP Servers

| Provider | IMAP Host | SMTP Host |
|----------|-----------|-----------|
| Gmail | imap.gmail.com | smtp.gmail.com |
| Outlook/Hotmail | outlook.office365.com | smtp.office365.com |
| Yahoo | imap.mail.yahoo.com | smtp.mail.yahoo.com |
| iCloud | imap.mail.me.com | smtp.mail.me.com |
| ProtonMail | 127.0.0.1 (Bridge) | 127.0.0.1 (Bridge) |

## Usage Examples

```
"What email accounts do I have?"
"Show me my unread emails"
"Search for emails from john@example.com"
"Read email ID abc123 from my work account"
"Send an email to jane@example.com about the meeting"
"Mark that email as read"
"Delete the spam email"
```

## Project Structure

```
mcp-email-server/
├── src/
│   ├── index.ts              # MCP server entry
│   ├── types.ts              # TypeScript interfaces
│   ├── config.ts             # Environment configuration
│   ├── account-manager.ts    # Multi-account orchestration
│   ├── providers/
│   │   ├── base.ts           # Abstract EmailProvider
│   │   ├── gmail.ts          # Gmail API
│   │   ├── outlook.ts        # Microsoft Graph
│   │   ├── imap.ts           # IMAP/SMTP
│   │   └── index.ts          # Provider factory
│   └── auth/
│       ├── gmail-auth.ts     # Gmail OAuth setup
│       └── outlook-auth.ts   # Outlook OAuth setup
├── credentials/              # Your credentials (gitignored)
├── Dockerfile
├── docker-compose.yml
├── package.json
└── tsconfig.json
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run locally
npm start

# Auth scripts
npm run auth:gmail
npm run auth:outlook
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "SECURITY ERROR: plaintext secret" | Use `${ENV_VAR}` syntax in accounts.json |
| "Environment variable X is not set" | Add the variable to .env and source it |
| "ENOENT: token.json" | Run the auth script for that provider |
| "ENOTFOUND" | Check IMAP/SMTP host settings |
| "Authentication failed" | Verify credentials, use app password for IMAP |
| "Failed to reconnect to MCP_DOCKER" | Restart Docker Desktop, check MCP Gateway is enabled |
| "yaml: unmarshal errors" | Check custom.yaml format - `env` must be array of `{name, value}` objects |
| "couldn't read secret" | Don't use `secrets` field; use `env` with direct values instead |
| Empty accounts list | Ensure env vars have actual values in custom.yaml, not `${VAR}` syntax |

## License

GPL-3.0 License - see [LICENSE](LICENSE) for details.

## Author

**Augusto Linhares** - [18X Labs](https://github.com/augustolinhares)

---

Built with the [Model Context Protocol](https://modelcontextprotocol.io)
