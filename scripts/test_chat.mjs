// 非流式请求测试
const body = JSON.stringify({
  messages: [{ role: 'user', content: 'say hello in one word' }],
  stream: false,
});

const res = await fetch('http://127.0.0.1:8787/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer 123456',
  },
  body,
});

const data = await res.json();
console.log('Status:', res.status);
console.log('Model:', data.model);
console.log('Response:', JSON.stringify(data.choices?.[0]?.message, null, 2));
