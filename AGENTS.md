# AGENTS.md

Instruções operacionais para qualquer agente (OpenCode, Claude Code, etc.)
trabalhando neste repositório. Leia isto primeiro, sempre.

## Antes de codificar
Leia, nesta ordem, os arquivos em `planning/` (ou onde eles estiverem no repo):
1. `planning/00-CONTEXTO.md` — por quê este projeto existe e regras gerais.
2. `planning/01-ARQUITETURA.md` — stack, decisões técnicas, restrições de ambiente.
3. `planning/02-FEATURES-V1.md` — o que precisa ser implementado agora.
4. `planning/03-BACKLOG-FUTURO.md` — o que **não** implementar ainda.

Esses arquivos são a fonte da verdade sobre o quê construir. Este `AGENTS.md` é
sobre **como** trabalhar no código-dia-a-dia.

## Setup do ambiente
```bash
python3.11 -m venv .venv   # 3.11 é o piso mínimo (versão do Raspberry Pi); no VPS há 3.12 disponível, mas não usar recursos exclusivos dele
source .venv/bin/activate
pip install -r requirements.txt
cp config.example.json config.json   # depois preencher com token e chaves reais
cp system_prompt.example.txt system_prompt.txt
```
- Ambiente e dependências: **pip + .venv**, nada de poetry/uv/pipenv.
- Versão mínima do Python: **3.11** (ver `planning/01-ARQUITETURA.md` para o porquê).
- Manter `requirements.txt` atualizado a cada nova dependência adicionada
  (`pip freeze > requirements.txt` ou adicionar a linha manualmente — preferir
  manual, com versão fixada, pra não arrastar lixo transitivo pro arquivo).

## Rodando o bot localmente
```bash
source .venv/bin/activate
python -m vica   # ajustar conforme o entrypoint real definido
```

## Testes e lint
- **Sem testes automatizados por enquanto** — não criar suíte de pytest nem
  pedir pra rodar testes que não existem. Isso pode mudar mais pra frente; se
  mudar, este arquivo será atualizado.
- **Sem linter/formatter configurado por enquanto.** Ainda assim, seguir PEP 8
  de forma razoável (nomes claros, sem linhas gigantes, etc.) por bom senso, não
  porque há uma ferramenta cobrando.

## Estrutura de projeto (convenção a manter)
```
neovica/
├── vica/
│   ├── bot.py               # entrypoint / setup do client discord.py
│   ├── cogs/                # um cog por feature grande
│   │   ├── access.py
│   │   ├── chatbot.py
│   │   └── rank.py
│   ├── db/                  # camada de acesso a dados, isolada dos cogs
│   │   ├── connection.py
│   │   ├── access_repository.py
│   │   ├── chat_repository.py
│   │   ├── rank_repository.py
│   │   └── config_repository.py
│   ├── deployment.py        # inicialização HTTP-only dos scripts de comandos
│   └── llm/                 # abstração de provedores de LLM (Responses API)
│       └── provider.py
├── migrations/              # scripts de criação/alteração de schema SQLite
├── requirements.txt
├── config.example.json
├── system_prompt.example.txt
├── deploy_commands.py
├── delete_commands.py
├── neovica.example.service
└── planning/                # os arquivos 00-03
```
Esta é uma convenção, não uma lei absoluta — mas qualquer desvio relevante
precisa ter um motivo claro, e se virar padrão novo, atualizar esta seção.

## Regras de código
- **Nenhuma query SQL solta em cogs/comandos.** Tudo passa pela camada `db/`.
- **Nenhuma chamada direta a API de LLM fora de `llm/provider.py`.** A
  abstração de provedor/rotação vive só ali.
- Segredos (token do Discord, chaves de API) ficam em `config.json`, que é
  ignorado pelo Git e nunca deve ser commitado. Toda nova configuração precisa
  entrar também no `config.example.json`, sem segredos reais.
- O prompt local fica em `system_prompt.txt`, ignorado pelo Git; sua estrutura
  inicial deve ser copiada de `system_prompt.example.txt`.
- Configurações por servidor (multiplicadores de cargo, canais na lista negra,
  emoji de trigger) são dados de runtime no SQLite, não em `config.json`.
- Async em tudo que toca rede ou disco — nada de chamada bloqueante no event
  loop do bot.
- O projeto pode rodar em hardware modesto (Raspberry Pi 3B+, 1GB RAM). Evitar
  dependências pesadas sem necessidade real; se for adicionar uma lib grande,
  vale considerar se realmente precisa dela.

## O que NÃO fazer
- Não implementar nada que esteja apenas em `planning/03-BACKLOG-FUTURO.md` sem
  confirmação explícita — esse arquivo é intencionalmente um "não ainda".
- Não trazer fallback de Chat Completions pro chatbot — só provedores com
  suporte à Responses API entram na rotação (decisão já tomada, ver
  `planning/01-ARQUITETURA.md`).
- Não assumir existência de código legado da versão anterior da Vica — não
  existe, é reescrita do zero.
- Não adicionar testes, linter ou trocar o gerenciador de dependências por
  conta própria — são decisões já tomadas; se achar que vale revisitar,
  perguntar antes.

## Commits
- Commits pequenos e descritivos, em português ou inglês (manter consistência
  dentro do repo — se o primeiro commit for em um idioma, seguir nele).
- Se uma decisão relevante for tomada durante a implementação que diverge do
  planejado nos arquivos `0X-*.md`, atualizar o arquivo correspondente no mesmo
  commit (ou um commit imediatamente seguinte), não deixar a doc ficar
  desatualizada.
