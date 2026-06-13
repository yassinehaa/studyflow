export interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GroqOptions {
  model?: string;
  temperature?: number;
  response_format?: {
    type: 'json_object' | 'text';
  };
}

export async function callGroq(messages: GroqMessage[], options: GroqOptions = {}): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured. Please add it to your .env file.");
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: options.model || "llama-3.1-8b-instant",
      messages,
      temperature: options.temperature ?? 0.7,
      response_format: options.response_format
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    let parsedMessage = errorText;
    try {
      const errorJson = JSON.parse(errorText);
      parsedMessage = errorJson.error?.message || errorText;
    } catch (e) {}
    throw new Error(`Groq API Error (${response.status}): ${parsedMessage}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}
