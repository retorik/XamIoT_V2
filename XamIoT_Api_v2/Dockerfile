FROM node:20-alpine

RUN apk add --no-cache curl python3 make g++ bash ca-certificates && update-ca-certificates

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "src/app.js"]
