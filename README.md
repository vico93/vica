# NeoVica

Bot de Discord reescrito do zero com Python 3.11+, `discord.py`, SQLite e
Responses API.

## Setup rapido

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp config.example.json config.json
cp system_prompt.example.txt system_prompt.txt
python -m vica
```

No Windows, com Python 3.13 instalado pelo Microsoft Store:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item config.example.json config.json
Copy-Item system_prompt.example.txt system_prompt.txt
python -m vica
```

Python 3.11 continua sendo a versao minima suportada; Python 3.13 e adequado
para desenvolvimento local.

Preencha o token do Discord, o `application_id` da aplicacao/bot e pelo menos um
provedor em `config.json`. O arquivo nao deve ser commitado.

O prompt do sistema fica em `system_prompt.txt`, na mesma raiz do `config.json`,
e tambem nao deve ser commitado. `llm.send_system_prompt` vem como `true`; ao
defini-lo como `false`, a NeoVica nao envia `instructions` para o provider e o
prompt configurado diretamente na API Key do provider pode ser usado. Nesse
modo, o arquivo local de prompt nao e necessario.

A opcao `chatbot.respond_to_everyone` e falsa por padrao. Quando ativada, a Vica
tambem responde a mensagens humanas que usem `@everyone` ou `@here`.

Anexos de imagem presentes na mensagem que disparou a resposta sao enviados aos
provedores de visao. O limite global de anexos por mensagem fica em
`attachments.max_per_message` e vale 10 por padrao; anexos alem desse limite sao
ignorados.

O comando `/trigger` envia um pedido direto para a Vica. As mensagens direcionadas
ao chatbot recebem internamente metadados no formato `[meta|username|ID]`, e os
pedidos do comando usam `[trigger]texto[/trigger]`; as tags sao explicadas no
prompt do sistema e nao devem aparecer nas respostas.

O processo do bot nao sincroniza slash commands automaticamente. Use os scripts
abaixo sempre que adicionar, editar ou remover comandos:

```powershell
python deploy_commands.py
python deploy_commands.py --guild 123456789012345678
python delete_commands.py --global
python delete_commands.py --guild 123456789012345678
```

O deploy sem `--guild` e global. O script de limpeza exige `--global`, `--guild`
ou ambos para evitar uma remocao global acidental.

O bot precisa dos intents privilegiados `Server Members Intent` e `Message
Content Intent` habilitados no Developer Portal. O convite tambem deve incluir
os escopos `bot` e `applications.commands`.

Os comandos de configuracao usam a hierarquia de acesso persistida no SQLite:
o dono gerencia administradores, administradores gerenciam moderadores e ambos
podem alterar as configuracoes comuns.
