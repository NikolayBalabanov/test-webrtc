const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOM = 'room';

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

io.on('connection', socket => {
  console.log(`Client connected: ${socket.id}`);

  // Когда клиент подключается, отправляем событие 'ready' другим клиентам в комнате
  socket.to(ROOM).emit('ready', { sid: socket.id });

  // Входим в комнату
  socket.join(ROOM);

  // Обработка данных, отправленных клиентом
  socket.on('data', data => {
    const peerToSend = data.sid || null;
    data.sid = socket.id;

    // Если указан конкретный клиент, отправляем только ему, иначе всей комнате
    if (peerToSend) {
      io.to(peerToSend).emit('data', data);
    } else {
      socket.to(ROOM).emit('data', data);
    }
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);

    // Уведомляем остальных участников, что пользователь отключился
    socket.to(ROOM).emit('user-disconnected', { sid: socket.id });

    socket.leave(ROOM);
  });
});

const publicPath = path.join(__dirname, 'build');

app.use(express.static(publicPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
