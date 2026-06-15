import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.VITE_GROQ_API_KEY;
if (!apiKey) {
  console.error("VITE_GROQ_API_KEY is not defined in the environment or .env file.");
  process.exit(1);
}

fetch("https://api.groq.com/openai/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model: "llama-3.1-8b-instant",
    messages: [
      { role: "user", content: "Hello, say hello briefly in 1 sentence." }
    ],
    temperature: 0.7
  })
})
.then(res => {
  if (!res.ok) {
    return res.text().then(text => { throw new Error(`HTTP ${res.status}: ${text}`); });
  }
  return res.json();
})
.then(data => console.log("Success! Response from Llama 3.1 8B:\n", data.choices[0].message.content))
.catch(console.error);
