FROM oven/bun:1-alpine
WORKDIR /app
COPY relay.ts .
ENV PORT=8787
EXPOSE 8787
CMD ["bun", "relay.ts"]
