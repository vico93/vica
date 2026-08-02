# Vica — Reescrita do zero

## O que é
Vica é um bot de Discord para um servidor específico. Este documento (e os que o
acompanham) descrevem o planejamento de uma **reescrita completa do zero**.

## Por que reescrever
A versão anterior foi construída ao longo do tempo alternando entre várias IAs
diferentes (ChatGPT/Gemini/Copilot via web, depois VSCode+RooCode, depois
OpenCode). Cada ferramenta trouxe seu próprio estilo e convenções, sem uma visão
arquitetural unificada, e o resultado foi um código difícil de manter.

**Decisão: não vamos migrar nem reaproveitar código da versão antiga.** Começamos
do zero, com arquitetura definida ANTES do código, justamente para evitar cair no
mesmo problema.

## Regras gerais para quem for implementar (agente)
- Não existe código legado para consultar — não pergunte por ele, não tente
  "adivinhar" comportamento de uma versão anterior.
- Manter uma arquitetura modular desde o início: nada de um único arquivo gigante
  com tudo dentro (nem `main.py` com 2000 linhas, nem um `cogs/geral.py`
  fila-de-tudo).
- Cada funcionalidade grande (chatbot, rank) deve viver em seu próprio módulo/cog,
  com sua própria camada de dados isolada.
- Documentar decisões nas mensagens de commit e, se algo relevante mudar em
  relação ao planejado aqui, atualizar os arquivos de planejamento junto.
- Este documento é a fonte da verdade do "porquê". Os demais arquivos
  (`planning/01-ARQUITETURA.md`, `planning/02-FEATURES-V1.md`,
  `planning/03-BACKLOG-FUTURO.md`) detalham o
  "o quê" e o "como".
