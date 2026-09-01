FROM node:current-alpine
WORKDIR /app

# Install MCP SDK, Memory Server module, and Express
RUN npm install @modelcontextprotocol/sdk @modelcontextprotocol/server-memory express

COPY server.mjs .
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh

# Environment configuration
ENV PORT=3000
ENV DATA_DIR=/app/data
VOLUME /app/data

EXPOSE 3000
ENTRYPOINT ["./entrypoint.sh"]
