'use strict';
const http = require('node:http');
const { formatDate } = require('./format');

if (!process.env.SESSION_SECRET) {
  console.error('SESSION_SECRET is not set');
  process.exit(1);
}

http
  .createServer((req, res) => res.end(`notes, ${formatDate(new Date())}\n`))
  .listen(Number(process.env.PORT) || 3000);
