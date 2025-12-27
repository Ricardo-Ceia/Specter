const http = require('http');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const os = require('os');
const { url } = require('inspector');

const FIFO_PATH = `/tmp/terminal_time_tracker_${process.env.USER}/stream`;
const History_File = path.join(os.homedir(), '.terminal_time_history.jsonl');
// Store connected SSE clients
const clients = new Set();

//cache for 30-day history
let historyCache = null;
let lastCacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000;  

const MIME_TYPES = {
  '.html':  'text/html',
  '.js':  'application/javascript',
  '.css': 'text/css'
};

function getHistoryCache(days=30){
  const now = Date.now();

  if (historyCache && (now-lastCacheTime) < CACHE_DURATION) {
    return historyCache;
  }

  const cutoff = now - (days*24*60*60*1000);
  const results = {};

  if (!fs.existsSync(History_File)) {
    historyCache = [];
    lastCacheTime = now;
    return historyCahce;
  }

  const content = fs.readFileSync(History_File, 'utf8');
  const lines = content.trim().split('\n').filter(Boolean);


  for (const line of lines) {
    try{
      const entry = JSON.parse(line);
      if (entry.timestamp *1000 >= cutoff) {
        results[entry.data] = entry;
      }
  }  catch (e){
    //skip invalid lines  
    }
  }

  historyCache = Object.values(results).sort((a, b) => a.timestamp - b.timestamp);
  lastCacheTime = now;
  return historyCache;
}

function startFifoReader() {
  // Check if FIFO exists before trying to read
  if (!fs.existsSync(FIFO_PATH)) {
    console.log('Waiting for FIFO to be created...');
    setTimeout(startFifoReader, 1000);
    return;
  }

  const stream = fs.createReadStream(FIFO_PATH, { encoding: 'utf8' });
  
  stream.on('error', (err) => {
    if (err.code === 'ENOENT') {
      console.log('FIFO pipe was deleted, waiting for tracker to restart...');
      setTimeout(startFifoReader, 1000);
    } else {
      console.error('Stream error:', err);
    }
  });

  const rl = readline.createInterface({ input: stream });

  rl.on('line', (line) => {
    // Send to connected clients
    for (const res of clients) {
      res.write(`data: ${line}\n\n`);
    }
  });

  rl.on('close', () => {
    console.log('FIFO closed, reconnecting...');
    setTimeout(startFifoReader, 1000);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.url === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    clients.add(res);
    req.on('close', () => clients.delete(res));
  }
  else if (req.url === '/api/history') {
      const days = parseInt(url.searchParams.get('days') || 30);
      const history = getHistoryCache(days);
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify(history));
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
