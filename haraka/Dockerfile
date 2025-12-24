FROM node:18-alpine

# Install dependencies for building native modules
RUN apk add --no-cache python3 make g++

# Install Haraka
RUN npm install -g Haraka

WORKDIR /app

# Initialize Haraka app
RUN haraka -i .

# Install dependencies including redis
RUN npm install ioredis mailparser

# Copy config and plugins
COPY config/ /app/config/
COPY plugins/ /app/plugins/

# Expose SMTP port
EXPOSE 25

CMD ["haraka", "-c", "."]
