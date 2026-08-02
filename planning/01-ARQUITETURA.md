# Arquitetura e Stack

## Ambiente de execução (restrição importante)
- **Hoje**: VPS emprestado, AlmaLinux.
- **Amanhã, possivelmente**: Raspberry Pi 3B+ (1GB RAM, ARM). Se o VPS "for pro
  saco", o bot precisa migrar pra lá sem drama.
- Consequência prática: **evitar dependências pesadas**. Nada de libs de ML
  locais, nada de rodar modelo localmente, tudo de IA é via API remota. Preferir
  bibliotecas leves e I/O assíncrono (o bot passa a maior parte do tempo esperando
  rede, não CPU).
- **Versões de Python confirmadas nos dois ambientes:**
  - VPS AlmaLinux: **3.12.13**
  - Raspberry Pi 3B+: **3.11.2** (pode ser atualizado no futuro)
- **Versão mínima do projeto: Python 3.11** — é o piso entre os dois ambientes.
  Não usar sintaxe/recursos exclusivos do 3.12+ (ex: melhorias de
  `typing`/`itertools` introduzidas só na 3.12), pra não quebrar no Pi caso ele
  não seja atualizado. Se o Pi for atualizado pra 3.12+ no futuro, revisar esta
  seção e liberar o uso de recursos mais novos, se fizer sentido.

## Linguagem e biblioteca do Discord
- **Python** + **discord.py 2.x**.
- Apenas **slash commands** (`app_commands`), sem comandos por prefixo.

## Persistência de dados
- **SQLite** (via `aiosqlite` para não bloquear o event loop), com WAL mode
  habilitado para melhor concorrência de leitura/escrita.
- Motivo: zero overhead de processo externo (importante no Raspberry Pi), arquivo
  único fácil de fazer backup e de mover entre VPS ↔ Pi.
- **Importante**: isolar todo acesso a banco atrás de uma camada de repositório
  (ex: `db/repository.py` ou um repo por domínio: `db/rank_repository.py`,
  `db/chat_repository.py`, `db/config_repository.py`). Nenhuma query SQL solta
  espalhada pelos cogs/comandos. Isso deixa a porta aberta pra trocar de banco no
  futuro sem reescrever tudo.

## Integração com LLM (chatbot)
- Usar a **Responses API** (spec [openresponses.org](https://openresponses.org)),
  que já é suportada por vários provedores OpenAI-compatible (não só a OpenAI
  oficial).
- **Rotação entre provedores**: o usuário tem créditos sobrando em vários
  provedores e quer alternar entre eles. Construir uma camada de abstração
  (`llm/provider.py` ou similar) com:
  - Lista configurável de provedores (via `config.json`), cada um com sua
    `base_url`, `api_key` e modelo.
  - **Só entram na lista provedores que suportam a Responses API.** Sem
    fallback pra Chat Completions — se um provedor não suportar, ele
    simplesmente não é usado (o dono do bot troca manualmente pra outro na
    config).
  - Lógica de fallback entre provedores em caso de erro/rate limit/créditos
    esgotados (tentar o próximo da lista) — todos falando o mesmo protocolo
    (Responses API), então essa troca é direta.
- Contexto de conversa: **por canal** (não por usuário), usando o mecanismo de
  conversa/contexto nativo da Responses API.

## Configuração e segredos
- Tokens e chaves de API ficam em `config.json`, nunca hardcoded no código e
  nunca commitados. O arquivo real é ignorado pelo Git; `config.example.json`
  documenta a estrutura sem conter segredos reais.
- O prompt de sistema fica em `system_prompt.txt`, na raiz ao lado do
  `config.json`, e é ignorado pelo Git. `config.example.json` controla apenas se
  ele deve ser enviado (`llm.send_system_prompt`, padrão `true`). Quando falso,
  a requisição não inclui `instructions`, permitindo configurar o prompt no
  provider.
- Configurações por servidor (canais na lista negra, emoji de trigger, multiplicadores
  de cargo, etc.) ficam no SQLite, não em `config.json` — são dados, não segredos, e
  precisam ser alteráveis em runtime via comando.

## Logging e resiliência
- Logging estruturado (nível INFO em produção, DEBUG opcional via `config.json`),
  gravando em arquivo com rotação (`logging.handlers.RotatingFileHandler`) além
  do console.
- Chamadas de API externas (Discord e LLM) devem ter tratamento de erro e retry
  com backoff — especialmente importante dado que o plano é rodar em hardware
  modesto com conexão possivelmente instável.

## Deploy
- Rodar como serviço `systemd` em ambos ambientes (AlmaLinux e Raspberry Pi OS),
  com restart automático em caso de crash.
- Não depender de Docker (não foi decisão do usuário; manter simples, processo
  Python direto + venv).
- A sincronização de slash commands é manual, pelos scripts
  `deploy_commands.py` e `delete_commands.py`; o processo do bot não altera o
  registro de comandos durante o startup.
