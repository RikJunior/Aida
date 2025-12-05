// Класс для управления чатом
class ChatBot {
    constructor() {
        this.chatMessages = document.getElementById('chatMessages');
        this.chatInput = document.getElementById('chatInput');
        this.sendButton = document.getElementById('sendButton');
        this.isProcessing = false;
        
        this.initializeChat();
        this.setupEventListeners();
    }

    initializeChat() {
        // Очищаем чат и добавляем только приветственное сообщение
        this.chatMessages.innerHTML = '';
        this.addMessage('bot', 'Здравствуйте! Чем я могу вам помочь сегодня? Я готова ответить на все вопросы по услугам «Қазақтелеком» в полном объеме.');
    }

    setupEventListeners() {
        // Отправка по кнопке
        this.sendButton.addEventListener('click', () => this.sendMessage());
        
        // Отправка по Enter
        this.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !this.isProcessing) {
                this.sendMessage();
            }
        });
    }

    async sendMessage() {
        const message = this.chatInput.value.trim();
        
        if (!message || this.isProcessing) return;
        
        // Добавляем сообщение пользователя
        this.addMessage('user', message);
        this.chatInput.value = '';
        this.chatInput.focus();
        
        // Показываем индикатор загрузки
        this.showLoading();
        this.isProcessing = true;
        
        try {
            // Отправляем запрос на сервер
            const response = await this.getBotResponse(message);
            
            // Убираем индикатор загрузки
            this.hideLoading();
            
            // Добавляем ответ бота
            this.addMessage('bot', response);
        } catch (error) {
            console.error('Ошибка:', error);
            this.hideLoading();
            this.addMessage('bot', 'Извините, произошла ошибка при обработке запроса. Пожалуйста, попробуйте еще раз.');
        } finally {
            this.isProcessing = false;
        }
    }

    async getBotResponse(query) {
        try {
            // Отправляем запрос на сервер
            const response = await fetch('/ask', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query: query })
            });
            
            if (!response.ok) {
                throw new Error('Сервер вернул ошибку');
            }
            
            const data = await response.json();
            return data.answer || data.error || 'Не удалось получить ответ';
            
        } catch (error) {
            console.error('Ошибка при запросе к серверу:', error);
            // Если сервер не отвечает, используем локальную логику
            return this.mockAIResponse(query);
        }
    }

    async mockAIResponse(query) {
        // Имитация задержки сети
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Простая логика для демонстрации
        const queryLower = query.toLowerCase();
        
        if (queryLower.includes('привет') || queryLower.includes('здравствуйте')) {
            return 'Привет! Я Aida, виртуальный помощник «Қазақтелеком». Чем могу помочь?';
        } else if (queryLower.includes('интернет') && queryLower.includes('подключить')) {
            return 'Для подключения интернета вы можете: 1) Позвонить по номеру 123 2) Оставить заявку на сайте 3) Посетить ближайший офис «Қазақтелеком». Подключение обычно занимает 1-3 рабочих дня.';
        } else if (queryLower.includes('тариф') || queryLower.includes('цена')) {
            return 'У нас есть различные тарифы для интернета: от 3000 тенге за 50 Мбит/с до 12000 тенге за 500 Мбит/с. Все тарифы с безлимитным трафиком!';
        } else if (queryLower.includes('оплат') || queryLower.includes('баланс')) {
            return 'Оплатить услуги можно: через Kaspi.kz, в приложении «Қазақтелеком», на сайте kazakhtelecom.kz или в терминалах. Для проверки баланса позвоните на 123.';
        } else if (queryLower.includes('техподдержк') || queryLower.includes('помощь')) {
            return 'Техническая поддержка доступна 24/7 по номеру 123. Звонок бесплатный. Также можете написать в чат поддержки на сайте.';
        } else if (queryLower.includes('wi-fi') || queryLower.includes('пароль')) {
            return 'Чтобы поменять пароль Wi-Fi: 1) Откройте браузер 2) Введите 192.168.1.1 3) Логин и пароль обычно "admin" 4) Найдите раздел "Wi-Fi Settings" и измените пароль.';
        } else if (queryLower.includes('телевиз') || queryLower.includes('iptv')) {
            return 'Да, у нас есть услуга IPTV! Более 100 каналов в HD качестве. Стоимость от 2000 тенге в месяц. Для подключения позвоните на 123.';
        } else {
            return 'Я поняла ваш вопрос: "' + query + '". К сожалению, моя база знаний еще обучается. Для получения подробной информации рекомендую позвонить в техподдержку по номеру 123.';
        }
    }

    addMessage(sender, text) {
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
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'message message--bot';
        loadingDiv.id = 'loadingMessage';
        loadingDiv.innerHTML = `
            <div class="message__content">
                <div class="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
            <span class="message__time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        `;
        
        this.chatMessages.appendChild(loadingDiv);
        this.scrollToBottom();
    }

    hideLoading() {
        const loadingMessage = document.getElementById('loadingMessage');
        if (loadingMessage) {
            loadingMessage.remove();
        }
    }

    scrollToBottom() {
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
    const chatBot = new ChatBot();
});

// Добавляем стили для индикатора набора текста
const style = document.createElement('style');
style.textContent = `
    .typing-indicator {
        display: flex;
        align-items: center;
        height: 20px;
    }
    
    .typing-indicator span {
        height: 8px;
        width: 8px;
        margin: 0 2px;
        background-color: #999;
        border-radius: 50%;
        display: inline-block;
        animation: typing 1.4s infinite ease-in-out both;
    }
    
    .typing-indicator span:nth-child(1) {
        animation-delay: -0.32s;
    }
    
    .typing-indicator span:nth-child(2) {
        animation-delay: -0.16s;
    }
    
    @keyframes typing {
        0%, 80%, 100% { 
            transform: scale(0.6);
            opacity: 0.5;
        }
        40% { 
            transform: scale(1);
            opacity: 1;
        }
    }
`;
document.head.appendChild(style);