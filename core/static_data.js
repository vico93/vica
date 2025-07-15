// core/static_data.js
const fs   = require('fs');
const path = require('path');
let perguntas, prompt;

function load() {
  perguntas = fs.readFileSync(path.join(__dirname,'../data/perguntas.txt'),'utf8')
                .split('\n').filter(Boolean);
  prompt    = fs.readFileSync(path.join(__dirname,'../data/system_prompt.txt'),'utf8').trim();
}
load();

module.exports = { perguntas, prompt, reload: load };