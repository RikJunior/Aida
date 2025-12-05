import express from "express";
import cors from "cors";
import { faqData } from "./data/data.js";

const app = express();
app.use(cors());
app.use(express.json());

// ---------- Улучшенная система поиска -----------

// Функция для нормализации текста (приведение к базовой форме)
function normalizeText(text) {
    return text
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, "") // Удаляем диакритические знаки
        .replace(/[^a-zа-яё0-9\s]/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
}

// Синонимы для общих слов
const synonyms = {
    'подключить': ['установить', 'настроить', 'активировать', 'оформить'],
    'интернет': ['инет', 'сеть', 'online', 'паутина'],
    'стоимость': ['цена', 'тариф', 'стоит', 'оплата', 'плата'],
    'не работает': ['сломался', 'вышел из строя', 'перестал работать', 'не функционирует'],
    'оплатить': ['заплатить', 'внести оплату', 'оплата', 'пополнить'],
    'пароль': ['pass', 'ключ', 'код доступа'],
    'wi-fi': ['вай фай', 'беспроводная сеть', 'вайфай'],
    'техподдержка': ['поддержка', 'служба поддержки', 'helpdesk', 'сервис'],
    'телевидение': ['тв', 'телевизор', 'каналы', 'телек'],
    'баланс': ['остаток', 'счет', 'средства'],
    'личный кабинет': ['аккаунт', 'профиль', 'кабинет', 'учетная запись'],
    'забыл': ['потерял', 'не помню', 'не могу вспомнить']
};

// Стемминг для русского языка (упрощенный)
function stemWord(word) {
    const rules = [
        // Удаляем падежные окончания
        {pattern: /(ов|ев|ёв|ин|ын|ых|их|ая|яя|ое|ее|ой|ей|ому|ему|ыми|ими|ам|ям|ом|ем|ах|ях|у|ю|ы|и|е|ё|ь|й)$/, replacement: ''},
        // Удаляем глагольные окончания
        {pattern: /(ться|тся|ла|на|ем|им|ете|ите|ут|ют|ат|ят|ешь|ишь|ете|ите)$/, replacement: ''}
    ];
    
    let stemmed = word;
    for (const rule of rules) {
        if (rule.pattern.test(stemmed)) {
            stemmed = stemmed.replace(rule.pattern, rule.replacement);
            break;
        }
    }
    
    return stemmed.length > 3 ? stemmed : word;
}

// Функция для расширения токенов синонимами
function expandWithSynonyms(tokens) {
    const expanded = new Set(tokens);
    
    tokens.forEach(token => {
        // Проверяем синонимы
        for (const [key, synList] of Object.entries(synonyms)) {
            if (key.includes(token) || synList.some(syn => syn.includes(token))) {
                synList.forEach(syn => expanded.add(syn));
                expanded.add(key);
            }
        }
    });
    
    return Array.from(expanded);
}

// Создание индекса ключевых слов для быстрого поиска
function createKeywordIndex(faqData) {
    const index = new Map();
    
    faqData.forEach((item, idx) => {
        const questionTokens = normalizeText(item.question).split(' ');
        const answerTokens = normalizeText(item.answer).split(' ');
        
        const allTokens = [...questionTokens, ...answerTokens];
        const stemmedTokens = allTokens.map(stemWord).filter(t => t.length > 2);
        const uniqueTokens = [...new Set(stemmedTokens)];
        
        uniqueTokens.forEach(token => {
            if (!index.has(token)) {
                index.set(token, []);
            }
            index.get(token).push(idx);
        });
    });
    
    return index;
}

// Комбинированная функция поиска
function hybridSearch(query, faqData, keywordIndex) {
    const normalizedQuery = normalizeText(query);
    const queryTokens = normalizedQuery.split(' ');
    const stemmedQueryTokens = queryTokens.map(stemWord).filter(t => t.length > 2);
    
    // Этап 1: Поиск по ключевым словам
    const keywordMatches = new Map();
    
    stemmedQueryTokens.forEach(token => {
        if (keywordIndex.has(token)) {
            keywordIndex.get(token).forEach(idx => {
                keywordMatches.set(idx, (keywordMatches.get(idx) || 0) + 1);
            });
        }
    });
    
    // Этап 2: TF-IDF для точного соответствия
    const tfidfScores = calculateTfIdfScores(normalizedQuery, faqData);
    
    // Этап 3: Jaccard similarity для частичного соответствия
    const jaccardScores = calculateJaccardSimilarities(normalizedQuery, faqData);
    
    // Комбинируем оценки
    const combinedScores = faqData.map((_, idx) => {
        const keywordScore = keywordMatches.get(idx) || 0;
        const tfidfScore = tfidfScores[idx] || 0;
        const jaccardScore = jaccardScores[idx] || 0;
        
        // Весовые коэффициенты
        const weights = {
            keyword: 0.4,
            tfidf: 0.4,
            jaccard: 0.2
        };
        
        // Нормализуем keywordScore
        const normalizedKeyword = keywordScore / stemmedQueryTokens.length;
        
        return (
            normalizedKeyword * weights.keyword +
            tfidfScore * weights.tfidf +
            jaccardScore * weights.jaccard
        );
    });
    
    // Находим лучший результат
    let bestScore = -Infinity;
    let bestIndex = -1;
    
    combinedScores.forEach((score, idx) => {
        if (score > bestScore) {
            bestScore = score;
            bestIndex = idx;
        }
    });
    
    return { bestIndex, bestScore };
}

// TF-IDF расчет (оптимизированный)
function calculateTfIdfScores(query, faqData) {
    const queryTokens = normalizeText(query).split(' ');
    
    // Рассчитываем IDF для корпуса
    const idf = calculateIDF(faqData);
    
    // TF для запроса
    const queryTF = {};
    queryTokens.forEach(token => {
        queryTF[token] = (queryTF[token] || 0) + 1;
    });
    
    // Нормализуем TF запроса
    Object.keys(queryTF).forEach(token => {
        queryTF[token] /= queryTokens.length;
    });
    
    // Рассчитываем TF-IDF для каждого вопроса
    return faqData.map((item, idx) => {
        const questionTokens = normalizeText(item.question).split(' ');
        const questionTF = {};
        
        questionTokens.forEach(token => {
            questionTF[token] = (questionTF[token] || 0) + 1;
        });
        
        // Нормализуем TF вопроса
        Object.keys(questionTF).forEach(token => {
            questionTF[token] /= questionTokens.length;
        });
        
        // Косинусная схожесть
        let dot = 0;
        let normA = 0;
        let normB = 0;
        
        const allTokens = new Set([...Object.keys(queryTF), ...Object.keys(questionTF)]);
        
        allTokens.forEach(token => {
            const a = (queryTF[token] || 0) * (idf[token] || 0);
            const b = (questionTF[token] || 0) * (idf[token] || 0);
            
            dot += a * b;
            normA += a * a;
            normB += b * b;
        });
        
        return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
    });
}

function calculateIDF(faqData) {
    const docs = faqData.map(item => 
        new Set(normalizeText(item.question).split(' '))
    );
    
    const df = {};
    docs.forEach(docTokens => {
        docTokens.forEach(token => {
            df[token] = (df[token] || 0) + 1;
        });
    });
    
    const idf = {};
    const totalDocs = docs.length;
    
    Object.keys(df).forEach(token => {
        idf[token] = Math.log(totalDocs / df[token]);
    });
    
    return idf;
}

// Jaccard similarity для учета порядка слов
function calculateJaccardSimilarities(query, faqData) {
    const queryTokens = new Set(normalizeText(query).split(' '));
    
    return faqData.map(item => {
        const questionTokens = new Set(normalizeText(item.question).split(' '));
        
        const intersection = new Set(
            [...queryTokens].filter(x => questionTokens.has(x))
        );
        
        const union = new Set([...queryTokens, ...questionTokens]);
        
        return intersection.size / union.size;
    });
}

// Обнаружение намерений пользователя
function detectIntent(query) {
    const lowerQuery = query.toLowerCase();
    
    const intentPatterns = {
        'connection': [/подкл[а-я]*/, /установ[а-я]*/, /настро[а-я]*/, /оформ[а-я]*/],
        'price': [/стоим[а-я]*/, /цен[а-я]*/, /тариф[а-я]*/, /сколько стоит/, /плат[а-я]*/],
        'problem': [/не работ[а-я]*/, /слом[а-я]*/, /проблем[а-я]*/, /не могу/, /не получается/],
        'payment': [/оплат[а-я]*/, /заплат[а-я]*/, /баланс[а-я]*/, /счет[а-я]*/],
        'password': [/парол[а-я]*/, /pass/, /ключ/, /доступ/],
        'support': [/техподдерж[а-я]*/, /поддержк[а-я]*/, /помощ[а-я]*/, /служб[а-я]/],
        'tv': [/телевид[а-я]*/, /тв/, /канал[а-я]*/, /iptv/],
        'account': [/личн[а-я]* кабинет/, /аккаунт/, /профил[а-я]*/, /учетн[а-я]* запис/]
    };
    
    for (const [intent, patterns] of Object.entries(intentPatterns)) {
        if (patterns.some(pattern => pattern.test(lowerQuery))) {
            return intent;
        }
    }
    
    return 'general';
}

// ---------- Инициализация системы ----------
const keywordIndex = createKeywordIndex(faqData);

// ---------- Endpoint /ask ----------
app.post("/ask", (req, res) => {
    const query = req.body.query;
    
    if (!query || query.trim().length < 2) {
        return res.json({
            answer: "Пожалуйста, задайте вопрос подробнее. Например: 'Как подключить интернет?' или 'Сколько стоит тариф?'",
            confidence: 0
        });
    }

    // Обнаруживаем намерение
    const intent = detectIntent(query);
    
    // Выполняем гибридный поиск
    const { bestIndex, bestScore } = hybridSearch(query, faqData, keywordIndex);

    // Пороговые значения
    const highConfidence = 0.7;
    const mediumConfidence = 0.4;
    
    if (bestScore >= highConfidence) {
        // Высокая уверенность - возвращаем точный ответ
        return res.json({
            question: faqData[bestIndex].question,
            answer: faqData[bestIndex].answer,
            confidence: bestScore.toFixed(2),
            intent: intent
        });
    } else if (bestScore >= mediumConfidence) {
        // Средняя уверенность - возвращаем ответ БЕЗ дублирования текста
        return res.json({
            question: faqData[bestIndex].question,
            answer: faqData[bestIndex].answer, // УБРАЛ дублирующийся текст
            confidence: bestScore.toFixed(2),
            intent: intent
        });
    } else {
        // Низкая уверенность - предлагаем варианты
        const relatedQuestions = getRelatedQuestions(intent, faqData);
        
        return res.json({
            answer: `Я не совсем уверена, что правильно поняла ваш вопрос: "${query}".\n\nВозможно, вас интересует:\n${relatedQuestions}\n\nИли позвоните в техподдержку: 123`,
            confidence: bestScore.toFixed(2),
            intent: intent,
            suggestions: relatedQuestions.split('\n')
        });
    }
});

// Получение связанных вопросов по намерению
function getRelatedQuestions(intent, faqData) {
    const intentQuestions = {
        'connection': ['подключить', 'установить', 'настроить'],
        'price': ['стоимость', 'цена', 'тариф', 'сколько стоит'],
        'problem': ['не работает', 'проблема', 'сломался'],
        'payment': ['оплатить', 'баланс', 'счет'],
        'password': ['пароль', 'wi-fi', 'доступ'],
        'support': ['техподдержка', 'помощь'],
        'tv': ['телевидение', 'тв', 'каналы'],
        'account': ['личный кабинет', 'аккаунт']
    };
    
    const keywords = intentQuestions[intent] || [];
    let suggestions = [];
    
    faqData.forEach(item => {
        const lowerQuestion = item.question.toLowerCase();
        if (keywords.some(keyword => lowerQuestion.includes(keyword))) {
            suggestions.push(`• ${item.question}`);
        }
    });
    
    return suggestions.slice(0, 3).join('\n');
}

// Дополнительный endpoint для проверки
app.get("/test", (req, res) => {
    const testQueries = [
        "Как подключить интернет?",
        "Интернет подключить как?",
        "Мне нужен интернет, как его подключить?",
        "Сколько стоит интернет?",
        "Какая цена на интернет?",
        "Интернет не работает",
        "Почему интернет не работает?",
        "Как оплатить за интернет?",
        "Где можно оплатить интернет?",
        "Забыл пароль от wi-fi",
        "Как поменять пароль на вай-фае?",
        "Телевидение подключить хочу",
        "Хочу тв каналы"
    ];
    
    const results = testQueries.map(query => {
        const { bestIndex, bestScore } = hybridSearch(query, faqData, keywordIndex);
        return {
            query,
            matchedQuestion: faqData[bestIndex]?.question || 'Не найдено',
            confidence: bestScore.toFixed(2),
            intent: detectIntent(query)
        };
    });
    
    res.json(results);
});

// Статическая раздача файлов
app.use(express.static('.'));

// ---------- Запуск сервера ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Улучшенный сервер запущен: http://localhost:${PORT}`);
    console.log(`🤖 API: POST http://localhost:${PORT}/ask`);
    console.log(`🧪 Тесты: GET http://localhost:${PORT}/test`);
});