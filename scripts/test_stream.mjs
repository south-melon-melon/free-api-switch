// 流式请求测试
const body = JSON.stringify({
  messages: [{ role: 'user', content: 'count from 1 to 3' }],
  stream: true,
});

const res = await fetch('http://127.0.0.1:8787/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer 123456',
  },
  body,
});

console.log('Status:', res.status);
console.log('--- SSE Stream ---');
for await (const chunk of res.body) {
  process.stdout.write(new TextDecoder().decode(chunk));
}
console.log('\n--- End ---');
