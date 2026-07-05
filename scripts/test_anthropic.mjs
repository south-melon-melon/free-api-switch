// Anthropic /v1/messages 非流式测试
const body = JSON.stringify({
  messages: [{ role: 'user', content: 'say hello in one word' }],
  max_tokens: 64,
  stream: false,
});

const res = await fetch('http://127.0.0.1:8787/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': '123456',
    'anthropic-version': '2023-06-01',
  },
  body,
});

const text = await res.text();
console.log('Status:', res.status);
console.log('Body:', text);
