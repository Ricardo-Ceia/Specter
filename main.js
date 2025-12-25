const http = require('http');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const FIFO_PATH = `/tmp/terminal_time_tracker_${process.env.USER}/stream`;

// Store connected SSE clients
const clients = new Set();

const MIME_TYPES = {
  '.html':  'text/html',
  '.js':  'application/javascript',
  '.css': 'text/css'
};

function startFifoReader() {
  const stream = fs.createReadStream(FIFO_PATH, {encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream});

  rl.on('line', (line) => {
    for (const res of clients) {
      res.write(`data: ${line}\n\n`);
    }
  });

  rl.on('close', () => {
    setTimeout(startFifoReader, 1000);
  });
}

const server = http.createServer((req, res) => {
  if (req.url === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    clients.add(res);
    req.on('close', () => clients.delete(res));
  } else {
    const filePath = req.url==='/' ? '/index.html' : req.url;
    const fullPath = path.join(__dirname,'public',filePath);
    const ext = path.extname(fullPath);

    fs.readFile(fullPath, (err,data)=>{
      if (err){
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200,{'Content-Type':MIME_TYPES[ext] || 'text/plain'});
      res.end(data);
    })
  }
});

server.listen(3000);
console.log('Server running at http://localhost:3000');
startFifoReader();
