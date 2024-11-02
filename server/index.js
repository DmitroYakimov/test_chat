const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
require('dotenv').config();
const ChatServer = require('./chatServer');

// Налаштування Express
const app = express();
app.use(express.static('client'));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Підключення до БД
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch((err) => console.error('MongoDB connection error:', err));
// Ініціалізація WebSocket сервера
ChatServer(wss);

// Запуск сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});