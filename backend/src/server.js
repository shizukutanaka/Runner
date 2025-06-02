require('dotenv').config();
const app = require('./app');
const dotenv = require('dotenv');
dotenv.config();
const http = require('http');
const setupWebSocket = require('./ws');

const PORT = process.env.PORT || 4000;
const server = http.createServer(app);
setupWebSocket(server, app);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
