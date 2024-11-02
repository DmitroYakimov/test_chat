const WebSocket = require('ws'); 
const { v4: uuidv4 } = require('uuid');
const Message = require('./models/Message');
const activeSessions = new Map();
const groups = new Map();

module.exports = function (wss) {
    wss.on('connection', (ws) => {
        ws.id = uuidv4();
        ws.isAlive = true;
        ws.on('pong', () => ws.isAlive = true);

        ws.on('message', async (data) => {
            const message = JSON.parse(data);
            if (message.type === 'auth') {
                const sessionId = uuidv4(); // Генеруємо унікальний ID для користувача
                activeSessions.set(sessionId, { username: message.username, ws }); // Зберігаємо сесію
                ws.send(JSON.stringify({ type: 'auth', sessionId })); // Надсилаємо ID сесії клієнту
                broadcastSystemMessage(`${message.username} приєднався до чату`, 'join');
                const lastMessages = await Message.find()
                .sort({ timestamp: -1 }) // Сортуємо повідомлення від нового до старого
                .limit(20)               // Беремо тільки останні 20 повідомлень
                .lean();                 // Зміна в формат JSON

            // Відправляєм повідомлення від старого до нового
            lastMessages.reverse().forEach(msg => ws.send(JSON.stringify({ ...msg, type: 'text' })));

                return;
            }
             // Обробка команд для груп
             if (message.type === 'command') {
                handleGroupCommands(ws, message);
                return;
            }
            if ((message.type === 'text' || 'audio') && message.content) {
                const session = activeSessions.get(message.sessionId);
                if (!session || session.username !== message.username) {
                    console.log('Unauthorized message attempt');
                    ws.send(JSON.stringify({ type: 'error', content: 'Unauthorized' }));
                    return;
                }
                const newMessage = new Message({
                    userId: ws.id,
                    username: message.username,
                    content: message.content,
                    timestamp: new Date().toISOString() // Добавляємо дату в ISO форматі
                });
                await newMessage.save();
                
                if (message.group) {
                    sendToGroup(message.group, {
                        type: 'text',
                        username: message.username,
                        content: message.content,
                        timestamp: newMessage.timestamp
                    });
                } else {
                    sendToAllClients({
                        type: 'text',
                        username: message.username,
                        content: message.content,
                        timestamp: newMessage.timestamp
                    });
            }
            }
        });

        ws.on('close', () => {
            activeSessions.forEach((session, sessionId) => {
                if (session.ws === ws) {
                    activeSessions.delete(sessionId); // Видаляємо сесію при відключенні
                    console.log(`User "${session.username}" with session ID ${sessionId} disconnected`);
                }
            });
        });
    });

    function createGroup(ws, groupName) {
        if (!groups.has(groupName)) {
            // Створюємо нову групу
            const groupMembers = new Set();
            groupMembers.add(ws.sessionId);
            groups.set(groupName, groupMembers);
    
            ws.send(JSON.stringify({ type: 'success', content: `Група "${groupName}" створена, і ви автоматично стали її учасником` }));
            console.log(`Група "${groupName}" створена користувачем ${ws.username}`);
        } else {
            ws.send(JSON.stringify({ type: 'error', content: `Група "${groupName}" вже існує` }));
        }
    }

    function inviteToGroup(ws, groupName, inviteeSessionId) {
        const group = groups.get(groupName);
        if (group && activeSessions.has(inviteeSessionId)) {
            group.add(inviteeSessionId);
            ws.send(JSON.stringify({ type: 'success', content: `Користувача додано до групи "${groupName}"` }));
            activeSessions.get(inviteeSessionId).ws.send(JSON.stringify({ 
                type: 'notification', 
                content: `Вас запросили до групи "${groupName}"` 
            }));
        } else {
            ws.send(JSON.stringify({ type: 'error', content: 'Група не знайдена або користувач недоступний' }));
        }
    }

    async function sendToGroup(groupName, message) {
        const group = groups.get(groupName);
        if (group) {
            await saveMessageToDB({ ...message, group: groupName });
            group.forEach(sessionId => {
                const session = activeSessions.get(sessionId);
                if (session && session.ws.readyState === WebSocket.OPEN) {
                    session.ws.send(JSON.stringify(message));
                }
            });
        }
    }

   async function sendToAllClients(message) {
        await saveMessageToDB(message);
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(message));
            }
        });
    }

    async function saveMessageToDB(messageData) {
        const message = new Message(messageData);
        await message.save();
    }

    function broadcastSystemMessage(content, type) {
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type, content }));
            }
        });
    }

    function handleGroupCommands(ws, message) {
        switch (message.command) {
            case 'createGroup':
                createGroup(ws, message.groupName);
                break;
            case 'inviteToGroup':
                inviteToGroup(ws, message.groupName, message.inviteeSessionId);
                break;
            default:
                ws.send(JSON.stringify({ type: 'error', content: 'Unknown command' }));
        }
    }
    
    setInterval(() => {
        wss.clients.forEach((ws) => {
            if (!ws.isAlive) return ws.terminate();
            ws.isAlive = false;
            ws.ping();
        });
    }, 30000);
};