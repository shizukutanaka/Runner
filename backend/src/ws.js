const { Server } = require('socket.io');

function setupWebSocket(server, app) {
  const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  app.set('io', io);

  io.on('connection', (socket) => {
    socket.on('newComment', (comment) => {
      io.emit('commentUpdate', comment);
    });
    socket.on('userUpdate', (user) => {
      io.emit('userUpdate', user);
    });
  });
}

module.exports = setupWebSocket;
