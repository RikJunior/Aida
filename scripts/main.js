// main.js
// Класс для управления чатом
class ChatBot {
    constructor() {
        this.chatMessages = document.getElementById('chatMessages');
        this.chatInput = document.getElementById('chatInput');
        this.sendButton = document.getElementById('sendButton');
        this.isProcessing = false;
        this.fetchTimeoutMs = 10000; // таймаут запроса к серверу

        this.initializeChat();
        this.setupEventListeners();
    }

    initializeChat() {
        // Очищаем чат и добавляем приветственное сообщение
        if (this.chatMessages) {
            this.chatMessages.innerHTML = '';
            this.addMessage('bot', 'Здравствуйте! Чем я могу вам помочь сегодня? Я готова ответить на все вопросы по услугам «Қазақтелеком».');
        }
    }

    setupEventListeners() {
        if (this.sendButton) {
            this.sendButton.addEventListener('click', () => this.sendMessage());
        }

        if (this.chatInput) {
            // Используем keydown и предотвращаем отправку при Shift+Enter
            this.chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !this.isProcessing && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }
    }

    async sendMessage() {
        if (!this.chatInput) return;
        const message = this.chatInput.value.trim();

        if (!message || this.isProcessing) return;

        // Добавляем сообщение пользователя
        this.addMessage('user', message);
        this.chatInput.value = '';
        this.chatInput.focus();

        // Показываем индикатор загрузки (если ещё не добавлен)
        if (!document.getElementById('loadingMessage')) this.showLoading();
        this.isProcessing = true;

        try {
            // Отправляем запрос на сервер (с таймаутом)
            const response = await this.getBotResponse(message);

            // Убираем индикатор загрузки
            this.hideLoading();

            // Обрабатываем разные форматы ответа
            if (response && typeof response === 'object') {
                // Если пришли suggestions (массив) — показываем красивый список
                if (Array.isArray(response.suggestions) && response.suggestions.length > 0) {
                    const suggestionsText = response.suggestions.join('\n');
                    const answerText = response.answer || suggestionsText;
                    this.addMessage('bot', answerText);
                } else if (response.answer) {
                    this.addMessage('bot', response.answer);
                } else {
                    // fallback
                    this.addMessage('bot', JSON.stringify(response));
                }
            } else if (typeof response === 'string') {
                this.addMessage('bot', response);
            } else {
                this.addMessage('bot', 'Не удалось получить корректный ответ от сервера.');
            }

        } catch (error) {
            console.error('Ошибка отправки сообщения:', error);
            this.hideLoading();
            this.addMessage('bot', 'Извините, произошла ошибка при обработке запроса. Попробуйте позже.');
        } finally {
            this.isProcessing = false;
        }
    }

    async getBotResponse(query) {
        // Используем AbortController для таймаута
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.fetchTimeoutMs);

        try {
            const res = await fetch('/ask', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query }),
                signal: controller.signal
            });

            clearTimeout(timeout);

            if (!res.ok) {
                // Если сервер вернул ошибку — пробуем прочитать JSON для подробностей
                let errText = `Сервер вернул ${res.status}`;
                try {
                    const errJson = await res.json();
                    errText += `: ${JSON.stringify(errJson)}`;
                } catch (_) {}
                throw new Error(errText);
            }

            const data = await res.json();
            // Ожидаем объект вида { answer, confidence, intent, suggestions }
            return data;
        } catch (err) {
            clearTimeout(timeout);
            console.warn('Ошибка при запросе к серверу или таймаут:', err);
            // fallback — локальная имитация ответа
            return this.mockAIResponse(query);
        }
    }

    async mockAIResponse(query) {
        // Имитация небольшого ожидания
        await new Promise(resolve => setTimeout(resolve, 700));

        const q = query.toLowerCase();
        if (q.includes('привет') || q.includes('здравствуйте')) {
            return { answer: 'Привет! Я Aida, виртуальный помощник «Қазақтелеком». Чем могу помочь?' };
        }
        if (q.includes('интернет') && q.includes('подключ')) {
            return { answer: 'Чтобы подключить интернет: 1) позвоните 123 2) оставьте заявку на сайте 3) посетите офис. Обычно 1–3 рабочих дня.' };
        }
        if (q.includes('тариф') || q.includes('цена') || q.includes('сколько стоит')) {
            return { answer: 'Тарифы: от 3000 тенге (50 Мбит) до 12000 тенге (500 Мбит). Подробно — на сайте.' };
        }
        if (q.includes('оплат') || q.includes('баланс')) {
            return { answer: 'Оплатить можно: Kaspi.kz, приложение, сайт или терминалы. Для проверки баланса — звоните 123.' };
        }
        if (q.includes('помощ') || q.includes('техподдерж')) {
            return { answer: 'Техподдержка 24/7 по номеру 123. Также доступен онлайн-чат.' };
        }
        if (q.includes('wi-fi') || q.includes('парол')) {
            return { answer: 'Смена пароля Wi-Fi: зайдите в 192.168.1.1, введите логин/пароль (часто admin/admin) → Wi-Fi settings → смена пароля.' };
        }
        if (q.includes('iptv') || q.includes('телевиз')) {
            return { answer: 'IPTV: более 100 каналов в HD. Стоимость от 2000 тг/мес. Для подключения — звоните 123.' };
        }

        return { answer: `Я поняла ваш вопрос: "${query}". Моя база знаний пока ограничена — рекомендую обратиться в техподдержку 123.` };
    }

    addMessage(sender, text) {
        if (!this.chatMessages) return;
        const messageDiv = document.createElement('div');
        messageDiv.className = `message message--${sender}`;

        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        messageDiv.innerHTML = `
            <div class="message__content">${this.escapeHtml(text)}</div>
            <span class="message__time">${time}</span>
        `;

        this.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();
    }

    showLoading() {
        // Не создаём дубликаты
        if (document.getElementById('loadingMessage')) return;

        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'message message--bot';
        loadingDiv.id = 'loadingMessage';
        loadingDiv.innerHTML = `
            <div class="message__content">
                <div class="typing-indicator">
                    <span></span><span></span><span></span>
                </div>
            </div>
            <span class="message__time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        `;

        this.chatMessages.appendChild(loadingDiv);
        this.scrollToBottom();
    }

    hideLoading() {
        const loadingMessage = document.getElementById('loadingMessage');
        if (loadingMessage) loadingMessage.remove();
    }

    scrollToBottom() {
        if (!this.chatMessages) return;
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Инициализация чата при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    new ChatBot();
});

// Стили индикатора (если вы вставляете через main.js)
const style = document.createElement('style');
style.textContent = `
.typing-indicator { display:flex; align-items:center; height:20px; }
.typing-indicator span { height:8px; width:8px; margin:0 2px; background-color:#999; border-radius:50%; display:inline-block; animation: typing 1.4s infinite ease-in-out both; }
.typing-indicator span:nth-child(1){ animation-delay:-0.32s; } 
.typing-indicator span:nth-child(2){ animation-delay:-0.16s; }
@keyframes typing { 0%,80%,100%{ transform: scale(0.6); opacity: 0.5; } 40%{ transform: scale(1); opacity:1; } }
`;
document.head.appendChild(style);
