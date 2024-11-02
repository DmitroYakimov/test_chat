const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const messageSchema = new Schema({
    userId: String,          // ID сесії користувача
    username: String,         // Ім'я користувача
    content: String,          // Зміст повідомлення
    timestamp: Date,          // Час відправки повідомлення
    group: String             // Назва групи
});

module.exports = mongoose.model('Message', messageSchema);