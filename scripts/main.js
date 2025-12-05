import express from "express";
// ИСПРАВЛЕННЫЙ ПУТЬ: Теперь он корректно ведет из scripts/ в data/
import { faqData } from "../data/data.js"; 

const app = express();
app.use(express.json());

// ---------- TF-IDF и косинусная похожесть -----------

/**
 * Токенизация текста: приведение к нижнему регистру, 
 * удаление знаков препинания и разбиение по пробелам.
 * @param {string} text 
 * @returns {string[]} Массив токенов
 */
function tokenize(text) {
  // Обработка кириллицы (а-яё), латиницы (a-z), цифр (0-9) и пробелов
  return text
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s]/gi, "")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Вычисляет IDF для всех токенов и векторы TF-IDF для каждого документа.
 * @param {object[]} faq - Массив объектов { question: string, answer: string }
 * @returns {{idf: object, vectors: object[]}}
 */
function buildTfIdf(faq) {
  const docs = faq.map(q => tokenize(q.question));

  // 1. Расчет Document Frequency (DF)
  const df = {};
  docs.forEach(tokens => {
    const unique = new Set(tokens);
    unique.forEach(t => (df[t] = (df[t] || 0) + 1));
  });

  // 2. Расчет Inverse Document Frequency (IDF)
  const idf = {};
  const totalDocs = docs.length;
  Object.keys(df).forEach(t => {
    // IDF = log(N / DF)
    idf[t] = Math.log(totalDocs / (df[t] || 1));
  });

  // 3. Расчет векторов TF-IDF
  const tfidfVectors = docs.map(tokens => {
    const tf = {};
    tokens.forEach(t => (tf[t] = (tf[t] || 0) + 1)); // Term Frequency

    const vec = {};
    Object.keys(tf).forEach(t => {
      // TF-IDF = (TF / Total_Tokens) * IDF
      vec[t] = (tf[t] / tokens.length) * idf[t];
    });
    return vec;
  });

  return { idf, vectors: tfidfVectors };
}

/**
 * Расчет косинусной похожести между двумя векторами (разреженными объектами).
 * @param {object} vecA 
 * @param {object} vecB 
 * @returns {number} Значение похожести (от 0 до 1)
 */
function cosineSimilarity(vecA, vecB) {
  let dot = 0, normA = 0, normB = 0;

  // Объединяем все ключи из обоих векторов для полного учета
  const keys = new Set([...Object.keys(vecA), ...Object.keys(vecB)]);
  keys.forEach(k => {
    const a = vecA[k] || 0;
    const b = vecB[k] || 0;
    dot += a * b;
    normA += a * a;
    normB += b * b;
  });

  // Косинус = (A * B) / (|A| * |B|)
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

// ---------- Подготовка FAQ при старте ----------

const tfidf = buildTfIdf(faqData);

// ---------- Endpoint /ask ----------

app.post("/ask", (req, res) => {
  const query = req.body.query;
  if (!query) {
    return res.status(400).json({ error: "Пустой запрос" });
  }

  const qTokens = tokenize(query);

  // 1. Расчет TF для запроса
  const tf = {};
  qTokens.forEach(t => (tf[t] = (tf[t] || 0) + 1));

  // 2. Расчет вектора TF-IDF для запроса
  const qVec = {};
  Object.keys(tf).forEach(t => {
    qVec[t] = (tf[t] / qTokens.length) * (tfidf.idf[t] || 0);
  });

  let bestScore = -Infinity;
  let bestIndex = -1;

  // 3. Поиск наиболее похожего вопроса
  tfidf.vectors.forEach((v, i) => {
    const score = cosineSimilarity(qVec, v);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  });
  
  // Устанавливаем минимальный порог похожести
  if (bestIndex === -1 || bestScore < 0.1) {
      return res.status(404).json({ 
        error: "Подходящего ответа не найдено. Попробуйте переформулировать запрос.", 
        similarity: bestScore.toFixed(3) 
      });
  }

  // Возвращаем лучший найденный ответ
  res.json({
    question: faqData[bestIndex].question,
    answer: faqData[bestIndex].answer,
    similarity: bestScore.toFixed(3),
  });
});

// ---------- Запуск сервера ----------

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));