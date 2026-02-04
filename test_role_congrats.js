
const oai = require('./core/oai_interface');
const config = require('./config.json');

// Mock data
const guildId = config.discord.guildId;
const userId = '123456789012345678';
const roleName = 'Membro VIP';
const promptUsuario = `{Username} ( <@${userId}> ) recebeu o cargo de ${roleName} ( <@&987654321> ), que é o primeiro cargo do servidor. Isso signifca que ele passou na "triagem" que o Vico faz para saber se a pessoa tem mesmo interesse em fazer amizades e participar do servidor. Avise o grupo (use @everyone) dessa subida de cargo.`;

async function test() {
  console.log('Testing gerarParabensCargoViaAPI...');
  try {
    const response = await oai.gerarParabensCargoViaAPI(guildId, userId, promptUsuario, roleName);
    console.log('Response:', response);
  } catch (error) {
    console.error('Error:', error);
    if (error.response) {
        console.error('Response data:', error.response.data);
    }
  }
}

test();
