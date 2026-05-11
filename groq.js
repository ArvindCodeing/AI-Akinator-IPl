const API_KEY = "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";
const API_URL = "https://api.groq.com/openai/v1/chat/completions";

export async function rewriteQuestion(label) {
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-70b-versatile",
        messages: [
            { role: "system", content: "You are an AI assistant helping an IPL Akinator game. Your ONLY job is to rewrite a dry technical question into a natural, conversational question. CRITICAL RULES: 1. It MUST remain a strict YES/NO question. 2. NEVER use metaphors (e.g. 'speedster', 'spin master'). 3. NEVER use the word 'OR' (do not give choices). 4. Keep it under 10 words. 5. Return ONLY the final question string." },
            { role: "user", content: `Rewrite this into a natural Yes/No question: ${label}` }
        ],
        temperature: 0.1
      })
    });

    if (!response.ok) return label; // fallback to original

    const data = await response.json();
    return data.choices[0].message.content.replace(/^["']|["']$/g, '');
  } catch (error) {
    console.error("Groq error:", error);
    return label;
  }
}

