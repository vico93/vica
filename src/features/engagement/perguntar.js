const DEFAULT_QUESTIONS = [
  'Se você pudesse viajar para qualquer lugar no tempo ou espaço agora, para onde iria?',
  'Qual é o seu jogo, filme ou série favorito de todos os tempos e por quê?',
  'Qual habilidade você gostaria de aprender instantaneamente?',
  'Se você tivesse que comer apenas uma comida pelo resto da vida, qual seria?',
  'Qual tecnologia atual você acha que vai parecer pré-histórica daqui a 50 anos?',
  'Qual é o seu passatempo favorito para relaxar depois de um longo dia?',
  'Se você pudesse ter qualquer superpoder, mas com um efeito colateral engraçado, qual escolheria?',
  'Qual foi a última coisa nova ou interessante que você aprendeu recentemente?'
];

export class EngagementService {
  /**
   * @param {object} [options]
   * @param {string[]} [options.questions]
   */
  constructor(options = {}) {
    this.questions = options.questions || DEFAULT_QUESTIONS;
  }

  /**
   * Retorna uma pergunta aleatória.
   * @returns {string}
   */
  getRandomQuestion() {
    const idx = Math.floor(Math.random() * this.questions.length);
    return this.questions[idx];
  }
}

export const engagementService = new EngagementService();
