const messages = document.getElementById('messages');
let ws;
let sessionId; // Унікальний ID сесії
let username;
let mediaRecorder;
let audioChunks = [];
let unreadMessages = 0;
const MAX_MESSAGE_LENGTH = 500; 
let reconnectInterval = 5000; // Інтервал для перепідключення до серверу

function connectToChat() {
    username = document.getElementById('username-input').value.trim();
    if (!username) {
        alert('Будь ласка, введіть своє ім\'я');
        return;
    }
    ws = new WebSocket(`ws://localhost:3000`);
    ws.onopen = () => {
        console.log('Connected to server');
        
        // Надсилаємо серверу ім'я користувача
        ws.send(JSON.stringify({ type: 'auth', username }));
    };

    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        console.log(message);
        // Обробляємо повідомлення про присвоєння ID сесії
        if (message.type === 'auth' && message.sessionId) {
            sessionId = message.sessionId;
            document.getElementById('login-container').style.display = 'none';
            updateTitleOnNewMessage();
            displayStatus('Авторизовано', 'success');
        } else if (message.type === 'text') {
            updateTitleOnNewMessage();
            displayMessage(message);
        }else if (message.type === 'success' || message.type === 'error') {
            displayStatus(message.content, message.type);
        }else if (message.type === 'join') {
            displaySystemMessage(message.content);
            updateTitleOnNewMessage();
        } else if (message.type === 'leave') {
            displaySystemMessage(message.content);
            updateTitleOnNewMessage();
        }else if (message.type === 'notification') {
            displaySystemMessage(message.content);
        }
    };

    ws.onclose = () => {
        displayStatus('Втрата зв\'язку з сервером. Перепідключення...', 'error');
        setTimeout(connectToChat, reconnectInterval);
    };

    ws.onerror = () => {
        displayStatus('Помилка з\'єднання', 'error');
    };
}

function createGroup() {
    const groupName = prompt('Введіть назву нової групи:');
    if (groupName) {
        ws.send(JSON.stringify({
            type: 'command',
            command: 'createGroup',
            groupName
        }));
    }
}

function inviteToGroup() {
    const groupName = prompt('Введіть назву групи:');
    const inviteeSessionId = prompt('Введіть ID сесії користувача для запрошення:');
    if (groupName && inviteeSessionId) {
        ws.send(JSON.stringify({
            type: 'command',
            command: 'inviteToGroup',
            groupName,
            inviteeSessionId
        }));
    }
}

// Функція відображення статусу відправлення
function displayStatus(statusText, statusType) {
    const statusElement = document.getElementById('status');
    statusElement.textContent = statusText;
    statusElement.className = statusType; // Добавляємо CSS-клас для стилізації
}

// Функція для відображення повідомлень
function displayMessage(message) {
    const messageElement = document.createElement('div');
    const timestamp = new Date(message.timestamp).toLocaleString();
    messageElement.textContent = `[${timestamp}] ${message.username}: ${message.content}`;
    messages.appendChild(messageElement);
}

function displayAudioMessage(message) {
    const messageElement = document.createElement('div');
    const timestamp = new Date(message.timestamp).toLocaleString();
    
    // Створюєм аудіоплеєр
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.src = `data:audio/wav;base64,${message.content}`;
    
    messageElement.textContent = `[${timestamp}] ${message.username}: `;
    messageElement.appendChild(audio);
    messages.appendChild(messageElement);
}

// Функція для початку запису
async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);

        // Обробник події запису даних
        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        // Обробник завершення запису
        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
            audioChunks = []; // Очищення буфера
            sendAudioMessage(audioBlob); // Відправляємо аудіоповідомлення після завершення запису
        };

        mediaRecorder.start();
        displayStatus('Запис почато', 'pending');
    } catch (error) {
        displayStatus('Помилка при доступі до мікрофона', 'error');
    }
}

// Функція для зупинки запису
function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop(); // Завершення запису
        displayStatus('Запис завершено', 'pending');
    } else {
        displayStatus('Запис не було розпочато', 'error');
    }
}

// Функція для відправки аудіоповідомлення
function sendAudioMessage(audioBlob) {
    const reader = new FileReader();
    reader.onloadend = () => {
        const base64AudioMessage = reader.result.split(',')[1]; // Отримуємо Base64 контент аудіо
        ws.send(JSON.stringify({
            type: 'audio',
            content: base64AudioMessage,
            username: 'User'
        }));
        displayStatus('Відправлено аудіоповідомлення', 'success');
    };
    reader.onerror = () => displayStatus('Помилка при відправці аудіоповідомлення', 'error');
    reader.readAsDataURL(audioBlob); // Читаємо аудіо як Data URL для кодування у Base64
}

function sendMessage(groupName = null) {
    const input = document.getElementById('message-input');
    const content = input.value.trim();

    if (content) {
        ws.send(JSON.stringify({
            type: 'text',
            content,
            username,
            sessionId, // Включаємо sessionId для автентифікації
            group: groupName // Відправляємо назву групи, якщо повідомлення для групи
        }));
        input.value = '';
    }
}
// Обновлення заголовку при новому повідомлені
function updateTitleOnNewMessage() {
    if (document.hidden) {
        unreadMessages++;
        document.title = `(${unreadMessages}) Нове повідомлення!`;
    }
}

// Зброс заголовку на звичайний, якщо сторінка в фокусі
window.addEventListener('focus', () => {
    unreadMessages = 0;
    document.title = 'Chat App';
});
// Функція для відображення статусу
function displayStatus(statusText, statusType) {
    const statusElement = document.getElementById('status');
    statusElement.textContent = statusText;
    statusElement.className = statusType;
}
function displaySystemMessage(content) {
    const messageElement = document.createElement('div');
    messageElement.className = 'system-message';
    messageElement.textContent = content;
    messages.appendChild(messageElement);
}

function handleSendMessage() {
    const groupName = document.getElementById('group-name-input').value.trim();
    const input = document.getElementById('message-input');
    const content = input.value.trim();

    // Перевірка на те, чи пусте повідомлення
    if (!content) {
        displayStatus('Повідомлення не може бути порожнім', 'error');
        return;
    }

    // Перевірка довжини повідомлення
    if (content.length > MAX_MESSAGE_LENGTH) {
        displayStatus(`Повідомлення занадто довге (макс. ${MAX_MESSAGE_LENGTH} символів)`, 'error');
        return;
    }

    sendMessage(groupName || null);
}