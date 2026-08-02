# NeoVica

Bot de Discord reescrito do zero com Python 3.11+, `discord.py`, SQLite e
Responses API.

## Setup rapido

```bash
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp config.example.json config.json
python -m vica
```

No Windows, com Python 3.13 instalado pelo Microsoft Store:

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item config.example.json config.json
python -m vica
```

Python 3.11 continua sendo a versao minima suportada; Python 3.13 e adequado
para desenvolvimento local.

Preencha o token do Discord, o `application_id` da aplicacao/bot e pelo menos um
provedor em `config.json`. O arquivo nao deve ser commitado.

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
