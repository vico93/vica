/*
** caminho: tools/calculate.js
** últimaMod: 2026-01-29
** autor: Vico
** colaboração: Roo
*/

/**
 * Handler para realizar cálculos matemáticos simples
 */
async function execute(args) {
  const { operation, a, b } = args;
  
  // Validação dos parâmetros
  if (typeof a !== 'number' || typeof b !== 'number') {
    throw new Error('Os parâmetros "a" e "b" devem ser números');
  }
  
  let result;
  let operationSymbol;
  
  switch (operation) {
    case 'add':
      result = a + b;
      operationSymbol = '+';
      break;
    case 'subtract':
      result = a - b;
      operationSymbol = '-';
      break;
    case 'multiply':
      result = a * b;
      operationSymbol = '×';
      break;
    case 'divide':
      if (b === 0) {
        throw new Error('Divisão por zero não é permitida');
      }
      result = a / b;
      operationSymbol = '÷';
      break;
    default:
      throw new Error(`Operação desconhecida: ${operation}. Use: add, subtract, multiply, divide`);
  }
  
  return {
    operation: operation,
    expression: `${a} ${operationSymbol} ${b}`,
    result: result,
    precision: Number.isInteger(result) ? 'integer' : 'float'
  };
}

module.exports = {
  execute
};
