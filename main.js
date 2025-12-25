const http = require('http');
const fs = require('fs');
const readline = require('readline');

const FIFO_PATH = `/tmp/terminal_time_tracker_${process.env.USER}/stream`;

// Store connected SSE clients
const clients = new Set();

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
      'Content-Type':
      'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    clients.add(res);
    req.on('close', () =>
      clients.delete(res));
  } else {
    fs.readFile('./index.html',(err,data)=>{
      if(err){
        res.writeHead(500);
        res.end('Error loading page');
        return;
      }
      res.writeHead(200,{'Content-Type':  'text/html'});
      res.end(data);
    })   
  }
});

server.listen(3000);
startFifoReader();
