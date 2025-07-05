// Arquivo: events/interactionCreate.js

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    // Se a interação não for um comando de barra, ignora
    if (!interaction.isChatInputCommand()) return;

    // Pega o comando correspondente da coleção de comandos do cliente
    const command = interaction.client.commands.get(interaction.commandName);

    // Se o comando não existir, avisa no console e para a execução
    if (!command) {
      console.error(`Nenhum comando correspondente a "${interaction.commandName}" foi encontrado.`);
      return;
    }

    try {
      // Executa o comando
      await command.execute(interaction);
    } catch (error) {
      // Se der erro na execução, avisa no console e para o usuário
      console.error(`Erro ao executar o comando "${interaction.commandName}"`);
      console.error(error);

      // Tenta responder ao usuário que deu erro
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'Ocorreu um erro ao executar este comando! 😢', ephemeral: true });
      } else {
        await interaction.reply({ content: 'Ocorreu um erro ao executar este comando! 😢', ephemeral: true });
      }
    }
  },
};