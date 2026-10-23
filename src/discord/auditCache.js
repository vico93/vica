/**
 ** caminho: src/discord/auditCache.js
 ** últimaMod: 2026-10-22 23:40
 ** autor: Vico
 ** colaboração: Roo Sonic e Kimi AI, OpenCode
 **/

const { LRUCache } = require('lru-cache');
module.exports = new LRUCache({ max: 1000, ttl: 30_000 });