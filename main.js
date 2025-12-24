const fs = require('fs');
const readline = require('readline');

const FIFO_PATH = `/tmp/terminal_time_tracker_${process.env.USER}/stream`;

const stream = fs.createReadStream(FIFO_PATH,{encoding: 'utf8'});
const rl = readline.createInterface({input: stream});

rl.on('line', ((line)=>{
  const data = JSON.parse(line);
  console.log(data);
}));

rl.on('close',  ()=>{
  console.log('Stream closed');
});
