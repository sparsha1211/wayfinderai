# Wayfinder AI — Production Cloud Dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy server files and package manifest
COPY package.json ./
COPY server/ ./server/

# Environment defaults
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Start Wayfinder Gateway Server
CMD ["node", "server/index.js"]
