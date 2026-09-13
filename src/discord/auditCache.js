/**
 ** caminho: core/auditCache.js
 ** últimaMod: 2025-09-03 00:50
 ** autor: Vico
 ** colaboração: Roo Sonic e Kimi AI
 **/

const LRU = require('lru-cache');
module.exports = new LRU({ max: 1000, ttl: 30_000 });