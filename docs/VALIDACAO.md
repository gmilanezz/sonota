# Validação da versão Ionic React V2

Validação realizada durante a geração desta entrega em 26/09/2026.

## O que foi verificado

- `npm run check`: **24 arquivos JavaScript** do backend, frontend legado, scripts e testes passaram na verificação sintática do Node.
- `src/app.js`, `src/db.js`, `src/entities.js`, `src/validation.js`, `src/workflow.js`, `src/assistant.js` e `src/files.js` foram verificados após as alterações.
- Todos os arquivos `.js` e `.jsx` de `mobile/src/` foram analisados/transpilados pelo parser TypeScript disponível no ambiente: **zero erros de parse JSX**.
- As migrações `001_initial.sql`, `002_product_workflow.sql` e `003_profile_avatar.sql` foram aplicadas em um banco SQLite temporário: as três foram registradas, `project_versions` foi criada e `avatar_file_id` apareceu em `users`.
- A árvore final foi revisada para não incluir `node_modules` ou dados de execução.

## Limite da validação no ambiente de geração

A instalação das dependências do npm excedeu o tempo de rede disponível no ambiente. Por isso, o `vite build` da nova interface Ionic e a suíte de integração que depende dos pacotes externos **não foram executados nesta revisão**.

Na máquina de desenvolvimento, execute:

```powershell
npm ci
npm --prefix mobile install
npm run ui:build
npm test
npm run check
```

O arquivo `Iniciar-Sonota.bat` automatiza instalação, build e inicialização no Windows com Node.js 24 LTS.

## Validações manuais recomendadas depois do primeiro build

1. Criar conta e entrar.
2. Cadastrar cliente com WhatsApp.
3. Cadastrar arranjo com um WAV/MP3/OGG real.
4. Criar projeto com cliente e arranjo.
5. Arrastar projeto entre etapas e confirmar Concluído.
6. Conferir o valor no Financeiro como A receber.
7. Marcar pagamento como recebido e verificar Dashboard/Fluxo de estúdio.
8. Adicionar protótipo V1, editar status para Aprovado/Master e testar download.
9. Testar Compartilhar no celular e a preparação de mensagem do WhatsApp.
10. Anexar PDF/PNG/JPG/XML, visualizar, baixar e excluir.
11. Testar comandos do Assistente e confirmar uma alteração.
12. Alterar foto/perfil e exportar dados.
