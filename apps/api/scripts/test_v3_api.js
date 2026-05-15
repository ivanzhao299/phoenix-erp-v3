const http = require('http');

http.get('http://127.0.0.1:3100/api/v3/iot/devices/A005/trends?properties=2001&range=7d', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Response:', data.slice(0, 500));
  });
}).on('error', (err) => {
  console.log('Error:', err.message);
});
