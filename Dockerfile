FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Copy source
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Remove devDependencies for production
RUN npm prune --production

# Set production environment
ENV NODE_ENV=production

# Create credentials directory and set permissions
# Use existing 'node' user (UID 1000) from base image
RUN mkdir -p /app/credentials && \
    chown -R node:node /app

USER node

CMD ["node", "dist/index.js"]
