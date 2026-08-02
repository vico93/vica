# Features da v1

Duas features na v1. Nada além disso deve ser implementado sem estar listado
aqui ou em `planning/03-BACKLOG-FUTURO.md`.

---

## 1. Chatbot

### Gatilhos (quando a Vica responde)
1. Alguém responde (reply) a uma mensagem anterior da própria Vica.
2. Alguém reage com um **emoji específico** a uma mensagem de **qualquer
   pessoa** (não precisa ser mensagem da Vica). O emoji é configurável por
   servidor.

### Configuração (admin/moderador apenas)
- Comando para definir qual emoji dispara a resposta por reação
  (ex: `/chatbot configurar-emoji <emoji>`). Guardar por servidor no SQLite.
- Deixar em aberto no código onde e como adicionar mais configurações do
  chatbot no futuro (ex: modelo a usar, tom de personalidade) sem precisar de
  refactor grande — mas **não implementar isso agora**, só deixar o design
  aberto pra extensão.

### Contexto de conversa
- Por **canal** (todas as respostas da Vica num canal compartilham o mesmo fio de
  contexto), usando a Responses API do provedor ativo (ver `planning/01-ARQUITETURA.md`
  para os detalhes de rotação/fallback entre provedores).

### Permissões
- Configuração do emoji: só quem tem permissão de admin/moderador no servidor.
- Uso do chatbot (responder via reply/reação): qualquer membro.
- A lista de administradores e moderadores é específica por servidor e fica no
  SQLite. O dono do servidor é administrador implícito.
- `/addadm` e `/removeadm` só podem ser usados pelo dono do servidor.
- Administradores podem gerenciar moderadores; administradores e moderadores
  podem alterar as configurações comuns.
- Membros e cargos podem ser cadastrados nas duas listas.

---

## 2. Rank (sistema de EXP)

### Quem ganha EXP
- Membros humanos.
- **A própria Vica também ganha EXP** (ela "conversa" via chatbot, então conta
  como participante).

### Como se ganha EXP
- **Mensagens de texto**: EXP ocasional por mensagem enviada (não precisa ser
  todo envio — variar/randomizar, evitando spam de EXP por flood de mensagens).
- **Tempo em canal de voz**: só conta se houver **pelo menos outro membro
  humano** no mesmo canal ao mesmo tempo. Ficar sozinho no canal, ou só com
  bots (incluindo a própria Vica), **não** gera EXP.
- A regra textual segue a referência da Loritta: mais de 5 caracteres, mensagem
  diferente da anterior, intervalo compatível com a quantidade de texto e mais
  de 12 caracteres após colapsar repetições consecutivas. O valor é sorteado
  entre `caracteres_simplificados / 7` e `/ 4`, limitado a 35 EXP.
- Voz concede 1 EXP por minuto a cada humano em canal elegível.

### Multiplicadores por cargo
- Cada cargo pode ter um percentual/multiplicador de EXP configurado por
  admin/moderador.
- Se um membro tem **múltiplos cargos com multiplicadores configurados**, usar
  **apenas o maior** — os multiplicadores não se somam/acumulam.
- A própria Vica (bot) precisa de um multiplicador padrão definido, já que ela
  também acumula EXP.
- O multiplicador usa fator decimal: `1.0` é normal, `1.5` é 50% a mais e
  `2.0` é o dobro. Apenas cargos com fator configurado participam da escolha do
  maior fator; sem cargo configurado, aplica-se `1.0`.
- Respostas da Vica usam a regra textual sem a checagem de velocidade humana e
  aplicam o multiplicador padrão `1.0`.

### Lista negra de canais
- Admin/moderador pode marcar canais (de texto e/ou de voz) para **não** serem
  monitorados para fins de EXP.
- Comando de gerenciamento (adicionar/remover/listar canais na lista negra).

### Comando de ranking
- Disponível para qualquer pessoa que possa rodar comandos (não é
  admin-only).
- Mostra um **embed** com o **top 10** colocados.
- Definir critério de desempate e formatação do embed (nome, posição, EXP
  total) na hora da implementação — não há requisito específico do usuário além
  de "bonitinho" e "top 10".

### Dados a persistir por membro (por servidor)
- EXP total acumulado.
- (Deixar em aberto se quer ter níveis derivados do EXP — não foi pedido, não
  implementar cálculo de nível na v1 a menos que seja trivial de adicionar
  depois sem refactor.)

### Comandos de configuração (admin/moderador)
- Definir multiplicador de um cargo.
- Adicionar/remover canal da lista negra.
