// OpenAI Service for GPT-4o integration
const OpenAI = require('openai');
const config = require('../config');
const logger = require('../logger');

let openai = null;
let isAvailable = false;

// Initialize OpenAI client
function initializeOpenAI() {
  if (!config.services.openai.apiKey) {
    logger.warn('[OpenAI] API key not configured. AI features will be disabled.');
    return false;
  }

  try {
    openai = new OpenAI({
      apiKey: config.services.openai.apiKey
    });
    isAvailable = true;
    logger.info('[OpenAI] Client initialized successfully with model:', config.services.openai.model);
    return true;
  } catch (error) {
    logger.error('[OpenAI] Failed to initialize:', error.message);
    return false;
  }
}

// Analyze comment sentiment using GPT-4o
async function analyzeSentiment(text, language = 'auto') {
  if (!isAvailable) {
    initializeOpenAI();
    if (!isAvailable) {
      return {
        sentiment: 'neutral',
        score: 0.5,
        confidence: 0,
        error: 'OpenAI not available'
      };
    }
  }

  try {
    const prompt = `Analyze the sentiment of the following comment and respond in JSON format.
Language: ${language === 'auto' ? 'Detect automatically' : language}

Comment: "${text}"

Respond with ONLY valid JSON in this exact format:
{
  "sentiment": "positive|negative|neutral",
  "score": 0.0-1.0,
  "intensity": "very_negative|negative|neutral|positive|very_positive",
  "confidence": 0.0-1.0,
  "language": "detected language code",
  "emotions": ["emotion1", "emotion2"],
  "toxicity": 0.0-1.0
}`;

    const completion = await openai.chat.completions.create({
      model: config.services.openai.model,
      messages: [
        {
          role: 'system',
          content: 'You are a multilingual sentiment analysis expert. Analyze sentiment accurately across languages including English, Japanese, Chinese, Korean, Spanish, French, German, and others. Always respond with valid JSON only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 200,
      response_format: { type: 'json_object' }
    });

    const result = JSON.parse(completion.choices[0].message.content);

    return {
      sentiment: result.sentiment || 'neutral',
      score: result.score || 0.5,
      intensity: result.intensity || 'neutral',
      confidence: result.confidence || 0.7,
      language: result.language || 'unknown',
      emotions: result.emotions || [],
      toxicity: result.toxicity || 0,
      model: config.services.openai.model,
      usage: completion.usage
    };

  } catch (error) {
    logger.error('[OpenAI] Sentiment analysis failed:', error.message);
    return {
      sentiment: 'neutral',
      score: 0.5,
      confidence: 0,
      error: error.message
    };
  }
}

// Detect toxic content using GPT-4o
async function detectToxicContent(text) {
  if (!isAvailable) {
    initializeOpenAI();
    if (!isAvailable) {
      return {
        isToxic: false,
        score: 0,
        categories: {},
        error: 'OpenAI not available'
      };
    }
  }

  try {
    // Use OpenAI's Moderation API (most accurate for toxicity)
    const moderation = await openai.moderations.create({
      input: text
    });

    const result = moderation.results[0];

    return {
      isToxic: result.flagged,
      score: Math.max(...Object.values(result.category_scores)),
      categories: result.category_scores,
      details: result.categories,
      model: 'text-moderation-latest'
    };

  } catch (error) {
    logger.error('[OpenAI] Toxicity detection failed:', error.message);
    return {
      isToxic: false,
      score: 0,
      categories: {},
      error: error.message
    };
  }
}

// Generate AI response for chatbot
async function generateChatbotResponse(userMessage, context = {}) {
  if (!isAvailable) {
    initializeOpenAI();
    if (!isAvailable) {
      return {
        response: 'AI assistant is currently unavailable.',
        confidence: 0,
        error: 'OpenAI not available'
      };
    }
  }

  try {
    const systemPrompt = `You are a helpful, friendly chatbot for a live streaming platform.
- Respond naturally and concisely
- Be supportive and engaging
- Use the streamer's context when available
- Detect the user's language and respond in the same language
- Keep responses under 200 characters unless more detail is needed`;

    const messages = [
      { role: 'system', content: systemPrompt }
    ];

    // Add context if available
    if (context.previousMessages && context.previousMessages.length > 0) {
      context.previousMessages.forEach(msg => {
        messages.push({ role: msg.role, content: msg.content });
      });
    }

    messages.push({ role: 'user', content: userMessage });

    const completion = await openai.chat.completions.create({
      model: config.services.openai.model,
      messages: messages,
      temperature: 0.8,
      max_tokens: 150
    });

    return {
      response: completion.choices[0].message.content,
      confidence: 0.8,
      model: config.services.openai.model,
      usage: completion.usage
    };

  } catch (error) {
    logger.error('[OpenAI] Chatbot response generation failed:', error.message);
    return {
      response: 'Sorry, I couldn\'t process your message right now.',
      confidence: 0,
      error: error.message
    };
  }
}

// Summarize multiple comments
async function summarizeComments(comments, options = {}) {
  if (!isAvailable) {
    initializeOpenAI();
    if (!isAvailable) {
      return {
        summary: 'AI summarization is currently unavailable.',
        error: 'OpenAI not available'
      };
    }
  }

  try {
    const commentsText = comments
      .map((c, i) => `${i + 1}. ${c.author}: ${c.content}`)
      .join('\n');

    const prompt = `Summarize the following live stream comments in 2-3 concise sentences.
Capture the main topics, sentiment, and notable interactions.
${options.language ? `Respond in ${options.language}.` : 'Respond in the predominant language of the comments.'}

Comments:
${commentsText}`;

    const completion = await openai.chat.completions.create({
      model: config.services.openai.model,
      messages: [
        {
          role: 'system',
          content: 'You are an expert at analyzing and summarizing live chat conversations. Be concise and capture the essence of the discussion.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.5,
      max_tokens: 200
    });

    return {
      summary: completion.choices[0].message.content,
      commentCount: comments.length,
      model: config.services.openai.model,
      usage: completion.usage
    };

  } catch (error) {
    logger.error('[OpenAI] Comment summarization failed:', error.message);
    return {
      summary: 'Failed to generate summary.',
      error: error.message
    };
  }
}

// Translate text
async function translateText(text, targetLanguage) {
  if (!isAvailable) {
    initializeOpenAI();
    if (!isAvailable) {
      return {
        translatedText: text,
        error: 'OpenAI not available'
      };
    }
  }

  try {
    const prompt = `Translate the following text to ${targetLanguage}. Maintain the tone and context.

Text: "${text}"

Respond with ONLY the translation, no explanations.`;

    const completion = await openai.chat.completions.create({
      model: config.services.openai.model,
      messages: [
        {
          role: 'system',
          content: 'You are a professional translator. Provide accurate, natural translations while preserving meaning and tone.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 500
    });

    return {
      translatedText: completion.choices[0].message.content.trim(),
      sourceLanguage: 'auto-detected',
      targetLanguage: targetLanguage,
      model: config.services.openai.model,
      usage: completion.usage
    };

  } catch (error) {
    logger.error('[OpenAI] Translation failed:', error.message);
    return {
      translatedText: text,
      error: error.message
    };
  }
}

// Initialize on module load
initializeOpenAI();

module.exports = {
  isAvailable: () => isAvailable,
  analyzeSentiment,
  detectToxicContent,
  generateChatbotResponse,
  summarizeComments,
  translateText,
  initializeOpenAI
};
