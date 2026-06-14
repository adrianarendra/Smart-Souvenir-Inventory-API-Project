FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy dependency manifests first (Docker layer cache optimization)
COPY package*.json ./

# Install only production dependencies
RUN npm install --omit=dev --no-audit && npm cache clean --force

# Copy application source code
COPY . .

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose backend API port
EXPOSE 3000

# Use dumb-init to handle PID 1 and signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
