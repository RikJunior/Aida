// server.js
import express from "express";
import cors from "cors";
import { faqData } from "./data/data.js"; // Убедись, что data/data.js экспортирует faqData

const app = express();
app.use(cors());
app.use(express.json());

// ---------------- утилиты ----------------
function normalizeText(text) {
    return String(text || '')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9а-яё\s]/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
}

// Синонимы (можно расширять)
const synonyms = {
    'подключить': ['установить', 'настроить', 'активировать', 'оформить'],
    'интернет': ['инет', 'сеть', 'online', 'паутина'],
    'стоимость': ['цена', 'тариф', 'стоит', 'оплата', 'плата'],
    'не работает': ['сломался', 'вышел из строя', 'перестал работать', 'не функционирует'],
    'оплатить': ['заплатить', 'внести оплату', 'пополнить'],
    'пароль': ['pass', 'ключ', 'код доступа'],
    'wi-fi': ['вай фай', 'беспроводная сеть', 'вайфай'],
    'техподдержка': ['поддержка', 'служба поддержки', 'helpdesk', 'сервис'],
    'телевидение': ['тв', 'телевизор', 'каналы', 'телек'],
    'баланс': ['остаток', 'счет', 'средства'],
    'личный кабинет': ['аккаунт', 'профиль', 'кабинет', 'учетная запись']
};

// Упрощённый стемминг
function stemWord(word) {
    if (!word) return '';
    const w = word.toLowerCase();
    const rules = [
        { pattern: /(ов|ев|ёв|ин|ын|ых|их|ая|яя|ое|ее|ой|ей|ому|ему|ыми|ими|ам|ям|ом|ем|ах|ях|у|ю|ы|и|е|ё|ь|й)$/, replacement: '' },
        { pattern: /(ться|тся|ла|на|ем|им|ете|ите|ут|ют|ат|ят|ешь|ишь)$/, replacement: '' }
    ];
    let stemmed = w;
    for (const rule of rules) {
        if (rule.pattern.test(stemmed)) {
            stemmed = stemmed.replace(rule.pattern, rule.replacement);
            break;
        }
    }
    return stemmed.length > 3 ? stemmed : stemmed;
}

function expandWithSynonyms(tokens) {
    const expanded = new Set(tokens);
    tokens.forEach(token => {
        for (const [key, synList] of Object.entries(synonyms)) {
            if (token === key || synList.includes(token) || token.includes(key) || key.includes(token)) {
                synList.forEach(s => expanded.add(s));
                expanded.add(key);
            }
        }
    });
    return Array.from(expanded);
}

// Создаём индекс ключевых слов (стеммы)
function createKeywordIndex(faqData) {
    const index = new Map();
    faqData.forEach((item, idx) => {
        const text = normalizeText(`${item.question} ${item.answer}`);
        const tokens = text.split(' ').map(stemWord).filter(t => t.length > 2);
        const unique = Array.from(new Set(tokens));
        unique.forEach(token => {
            if (!index.has(token)) index.set(token, []);
            index.get(token).push(idx);
        });
    });
    return index;
}

// IDF: сглаженный (всегда > 0)
function calculateIDF(faqData) {
    const docs = faqData.map(item =>
        new Set(normalizeText(item.question).split(' ').map(stemWord).filter(Boolean))
    );
    const df = {};
    docs.forEach(set => {
        set.forEach(token => {
            df[token] = (df[token] || 0) + 1;
        });
    });
    const totalDocs = docs.length || 1;
    const idf = {};
    Object.keys(df).forEach(token => {
        idf[token] = Math.log((totalDocs + 1) / (df[token] + 1)) + 1; // smoothing +1
    });
    return idf;
}

function calculateTfIdfScores(query, faqData, idf) {
    const queryTokensRaw = normalizeText(query).split(' ').map(stemWord).filter(t => t.length > 2);
    const queryTokens = queryTokensRaw.length ? expandWithSynonyms(queryTokensRaw) : [];
    const queryTF = {};
    queryTokens.forEach(t => { queryTF[t] = (queryTF[t] || 0) + 1; });
    Object.keys(queryTF).forEach(t => queryTF[t] /= queryTokens.length || 1);

    // для каждого документа считаем косинус по TF-IDF
    return faqData.map(item => {
        const docTokens = normalizeText(item.question).split(' ').map(stemWord).filter(t => t.length > 2);
        const docTF = {};
        docTokens.forEach(t => { docTF[t] = (docTF[t] || 0) + 1; });
        Object.keys(docTF).forEach(t => docTF[t] /= docTokens.length || 1);

        let dot = 0, normA = 0, normB = 0;
        const all = new Set([...Object.keys(queryTF), ...Object.keys(docTF)]);
        all.forEach(token => {
            const a = (queryTF[token] || 0) * (idf[token] || 0);
            const b = (docTF[token] || 0) * (idf[token] || 0);
            dot += a * b;
            normA += a * a;
            normB += b * b;
        });
        const denom = Math.sqrt(normA) * Math.sqrt(normB);
        return denom ? (dot / denom) : 0;
    });
}

function calculateJaccardSimilarities(query, faqData) {
    const qSet = new Set(normalizeText(query).split(' ').map(stemWord).filter(t => t.length > 2));
    return faqData.map(item => {
        const docSet = new Set(normalizeText(item.question).split(' ').map(stemWord).filter(t => t.length > 2));
        const intersection = new Set([...qSet].filter(x => docSet.has(x)));
        const union = new Set([...qSet, ...docSet]);
        return union.size ? (intersection.size / union.size) : 0;
    });
}

// Гибридный поиск
function hybridSearch(query, faqData, keywordIndex) {
    const normalizedQuery = normalizeText(query);
    const queryTokens = normalizedQuery.split(' ').map(stemWord).filter(t => t.length > 2);
    const expandedTokens = expandWithSynonyms(queryTokens);

    // keyword matches
    const keywordMatches = new Map();
    expandedTokens.forEach(token => {
        if (keywordIndex.has(token)) {
            keywordIndex.get(token).forEach(idx => {
                keywordMatches.set(idx, (keywordMatches.get(idx) || 0) + 1);
            });
        }
    });

    // IDF и TF-IDF
    const idf = calculateIDF(faqData);
    const tfidfScores = calculateTfIdfScores(query, faqData, idf);

    // Jaccard
    const jaccardScores = calculateJaccardSimilarities(query, faqData);

    // combine
    const stemLen = expandedTokens.length || 1;
    const weights = { keyword: 0.4, tfidf: 0.4, jaccard: 0.2 };

    const combinedScores = faqData.map((_, idx) => {
        const keywordScore = keywordMatches.get(idx) || 0;
        const normalizedKeyword = keywordScore / stemLen;
        const tfidfScore = tfidfScores[idx] || 0;
        const jaccardScore = jaccardScores[idx] || 0;
        return normalizedKeyword * weights.keyword + tfidfScore * weights.tfidf + jaccardScore * weights.jaccard;
    });

    let bestIndex = -1;
    let bestScore = -Infinity;
    combinedScores.forEach((score, idx) => {
        if (score > bestScore) { bestScore = score; bestIndex = idx; }
    });

    // гарантируем что bestScore не NaN
    if (!isFinite(bestScore)) bestScore = 0;

    return { bestIndex, bestScore };
}

// detect intent — используем normalizeText
function detectIntent(query) {
    const q = normalizeText(query);
    const intentPatterns = {
        'connection': [/подкл[а-я]*/, /установ[а-я]*/, /настро[а-я]*/, /оформ[а-я]*/],
        'price': [/стоим[а-я]*/, /цен[а-я]*/, /тариф[а-я]*/, /сколько стоит/, /плат[а-я]*/],
        'problem': [/не работ[а-я]*/, /слом[а-я]*/, /проблем[а-я]*/, /не могу/, /не получается/],
        'payment': [/оплат[а-я]*/, /заплат[а-я]*/, /баланс[а-я]*/, /счет[а-я]*/],
        'password': [/парол[а-я]*/, /pass/, /ключ/, /доступ/],
        'support': [/техподдержк[а-я]*/, /поддержк[а-я]*/, /помощ[а-я]*/, /служб[а-я]/],
        'tv': [/телевид[а-я]*/, /тв/, /канал[а-я]*/, /iptv/],
        'account': [/личн[а-я]* кабинет/, /аккаунт/, /профил[а-я]*/, /учетн[а-я]* запис/]
    };

    for (const [intent, patterns] of Object.entries(intentPatterns)) {
        if (patterns.some(pattern => pattern.test(q))) return intent;
    }
    return 'general';
}

// ----------------- инициализация индекса -----------------
const keywordIndex = createKeywordIndex(faqData);

// ----------------- API /ask -----------------
app.post("/ask", (req, res) => {
    const query = req?.body?.query || '';
    if (!query || query.trim().length < 2) {
        return res.json({
            answer: "Пожалуйста, задайте более подробный вопрос, например: 'Как подключить интернет?'",
            confidence: 0,
            intent: 'none'
        });
    }

    const intent = detectIntent(query);
    const { bestIndex, bestScore } = hybridSearch(query, faqData, keywordIndex);

    const highConfidence = 0.7;
    const mediumConfidence = 0.35; // чуть ниже, чтобы выдавать средние ответы чаще

    if (bestIndex >= 0 && bestScore >= highConfidence) {
        return res.json({
            question: faqData[bestIndex].question,
            answer: faqData[bestIndex].answer,
            confidence: Number(bestScore.toFixed(2)),
            intent
        });
    } else if (bestIndex >= 0 && bestScore >= mediumConfidence) {
        return res.json({
            question: faqData[bestIndex].question,
            answer: faqData[bestIndex].answer,
            confidence: Number(bestScore.toFixed(2)),
            intent
        });
    } else {
        const relatedQuestions = getRelatedQuestions(intent, faqData);
        return res.json({
            answer: `Не совсем уверена в точности. Возможно, вас интересует одно из этих: \n${relatedQuestions}`,
            confidence: Number(bestScore.toFixed(2)),
            intent,
            suggestions: relatedQuestions.split('\n').map(s => s.replace(/^•\s*/, '').trim()).filter(Boolean)
        });
    }
});

// helper для related
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
    const suggestions = [];
    faqData.forEach(item => {
        const q = normalizeText(item.question);
        if (keywords.some(k => q.includes(k))) suggestions.push(`• ${item.question}`);
    });
    // если мало — добавить первые несколько общих вопросов
    if (suggestions.length === 0) {
        faqData.slice(0, 3).forEach(it => suggestions.push(`• ${it.question}`));
    }
    return suggestions.slice(0, 5).join('\n');
}

// тестовый endpoint
app.get("/test", (req, res) => {
    const testQueries = [
        "Как подключить интернет?",
        "Интернет не работает",
        "Сколько стоит интернет?",
        "Как оплатить?",
        "Забыл пароль Wi-Fi",
        "Как подключить IPTV?"
    ];
    const results = testQueries.map(q => {
        const { bestIndex, bestScore } = hybridSearch(q, faqData, keywordIndex);
        return {
            query: q,
            matchedQuestion: faqData[bestIndex]?.question || 'Не найдено',
            confidence: Number(bestScore.toFixed(2)),
            intent: detectIntent(q)
        };
    });
    res.json(results);
});

// статика (если нужен index.html)
app.use(express.static('.'));

// запуск
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server started: http://localhost:${PORT}`);
    console.log(`POST /ask`);
    console.log(`GET  /test`);
});
