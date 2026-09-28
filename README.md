# Sonota — Ionic React + backend integrado

Esta é a evolução do projeto Sonota para uma aplicação **Ionic + React + JavaScript**, mantendo um backend Node.js/Express com SQLite e armazenamento privado de arquivos. A interface antiga em HTML/JS foi preservada como fallback em `public/`, mas a experiência principal agora fica em `mobile/` e é compilada para `public/ionic/`.

O foco desta versão é transformar o protótipo em uma demonstração funcional do fluxo real da M&G Criação: **cliente → projeto → arranjos/arquivos → protótipos/versões → financeiro → histórico/Dashboard**. O contato pessoal com o cliente continua fora da automação comercial; o Sonota organiza o que acontece ao redor desse relacionamento.

## Rodar no Windows

Requisito: **Node.js 24 LTS**.

### Opção mais simples

Execute `Iniciar-Sonota.bat`. Na primeira execução ele instala as dependências do backend e da interface, compila o Ionic React e inicia o servidor. Depois abra:

`http://localhost:3000`

### Pelo terminal

```powershell
npm ci
npm --prefix mobile install
npm run ui:build
npm start
```

Para desenvolver a interface com atualização automática, use dois terminais:

```powershell
npm run dev
```

```powershell
npm run ui:dev
```

A interface de desenvolvimento abre normalmente em `http://localhost:5173` e encaminha `/api` para o backend local.

## Estrutura

- `mobile/`: aplicação Ionic React/Vite e configuração Capacitor.
- `src/`: backend Express, regras, autenticação, busca, assistente, workflow e banco.
- `src/migrations/`: estrutura SQLite e evoluções do projeto.
- `public/ionic/`: saída gerada por `npm run ui:build`.
- `public/`: frontend legado preservado como fallback.
- `audio/`: integração opcional com processamento de áudio em Python.
- `docs/REQUISITOS-SONOTA.txt`: documentação usada como referência para esta evolução.
- `docs/IMPLEMENTACAO-IONIC-V2.md`: mapa de funcionalidades entregues e limites.

## Principais funcionalidades desta versão

### Login e conta

- cadastro, login e logout;
- isolamento de clientes, projetos, arranjos, arquivos e financeiro por conta;
- edição de nome, empresa, cargo, e-mail e telefone;
- confirmação por senha para alteração do e-mail;
- troca de senha;
- foto de perfil PNG/JPG;
- preferências de alertas armazenadas por usuário;
- exportação dos dados da conta, incluindo histórico e versões dos projetos.

### Dashboard com dados reais

- boas-vindas personalizadas;
- arranjos no acervo, clientes ativos, projetos em andamento e valor já recebido;
- Fluxo de estúdio dos últimos seis meses;
- gráfico com quantidade de projetos criados por mês e tooltip com o valor recebido no mesmo período;
- alertas automáticos de atraso, prazo próximo, protótipo sem envio, pagamento, nota fiscal, arranjo ausente e revisão;
- próximas entregas em ordem cronológica;
- atividades recentes geradas pelo histórico dos projetos;
- clique em alertas, entregas e atividades para abrir o projeto relacionado.

### Clientes

- CRUD completo e busca;
- CPF/CNPJ, empresa, e-mail, telefone, WhatsApp, cidade, status e observações;
- clique no card para abrir detalhes;
- resumo com projetos, ativos, contratado, recebido, pendente e arranjos usados;
- bloqueio de exclusão quando houver projeto vinculado.

### Projetos

- nome, descrição, cliente, arranjo, prazo, valor, proposta/briefing, objetivo, referências, estilo e instrumentos;
- cards principais sem repetir status;
- Kanban: Proposta, Em produção, Revisão, Concluído e Cancelado;
- drag-and-drop no computador;
- confirmação ao mover para Concluído ou Cancelado;
- alteração de etapa atualiza automaticamente histórico, Dashboard e Financeiro;
- ao concluir, o valor já aparece como “A receber” sem novo cadastro;
- reabrir o projeto não apaga pagamento ou documento financeiro;
- exclusão com confirmação.

### Workspace do projeto

Cada projeto ganhou uma área própria com:

- proposta e informações musicais;
- cliente e contato;
- resumo financeiro;
- versões/protótipos numerados automaticamente;
- status de versão: Protótipo, Revisão, Aprovado e Master;
- edição e exclusão de versões;
- player e download;
- envio/compartilhamento de protótipo;
- histórico cronológico;
- notas fiscais e anexos.

No celular, o botão **Compartilhar** usa o compartilhamento nativo quando o navegador/sistema aceita compartilhamento de arquivos. O botão WhatsApp prepara a mensagem e abre a conversa. Sem a API oficial do WhatsApp, o Sonota não afirma que uma mensagem foi enviada automaticamente: existe uma ação explícita para marcar a versão como enviada.

### Laboratório de Arranjos

A antiga página **Arranjos** passou a ser o **Laboratório de Arranjos**. O cadastro técnico fica centralizado na Biblioteca, enquanto o laboratório concentra processamento musical por IA:

- seção **Separação de Stems**, selecionando um arquivo da Biblioteca e gerando um ZIP com vocals, drums, bass e other via Demucs;
- seção **Transcrição**, escolhendo MIDI (`.mid`) ou Partitura (`.musicxml`);
- preview do áudio de origem;
- histórico dos processamentos;
- estados de fila/processamento/conclusão/erro;
- download das saídas geradas;
- atualização automática do histórico enquanto houver processamento ativo.

### Biblioteca

- cadastro de um novo arranjo diretamente pela Biblioteca;
- edição dos metadados e substituição opcional do arquivo;
- filtro por texto/nome, BPM, tonalidade, gênero, instrumento e tag;
- player;
- download;
- botões **Baixar**, **Editar**, **Localização** e **Excluir** em todos os cards.

No navegador, o botão Localização informa a limitação de segurança: uma página web não pode abrir arbitrariamente uma pasta do computador. O controle já está presente para uma futura versão desktop nativa.

### Busca inteligente

- linguagem natural;
- busca por BPM, tonalidade, gênero, instrumentos, tags e contexto do projeto;
- tolerância textual e sinônimos existentes no motor de busca;
- embeddings opcionais via Ollama;
- resultados mostram arranjos e projetos relacionados.

### Financeiro e notas fiscais

- utiliza o valor cadastrado no próprio projeto;
- estados derivados: Previsto, A receber, Recebido e Atrasado;
- vencimento de pagamento;
- marcar recebido/pendente;
- adicionar ou substituir documentos;
- visualizar, baixar e excluir PDF/PNG/JPG/XML;
- cards de documentos na ordem Projeto → descrição → arquivo;
- recebimentos alimentam o Dashboard e o Fluxo de estúdio pelo mês real do recebimento.

### Assistente Sonota

O chat flutuante entende pequenas variações e erros de escrita e agora pode:

- listar projetos e filtrar por etapa;
- responder quanto há a receber;
- informar a próxima entrega;
- procurar arranjos por faixa/aproximação de BPM;
- localizar a última versão de um projeto;
- criar uma proposta de novo projeto a partir de cliente/arranjo/valor identificados;
- alterar status, pagamento, valor, prazo, dados do cliente, BPM e tonalidade;
- abrir páginas da aplicação.

Ações de alteração/criação são apresentadas para revisão e **só são salvas após confirmação**.

## Capacitor / Android / iOS

O diretório `mobile/` já contém `capacitor.config.json` e dependências Android/iOS.

Depois de instalar as dependências:

```powershell
cd mobile
npm run cap:add:android
npm run cap:android
```

Para iOS, a etapa nativa precisa ser feita em macOS com Xcode:

```bash
npm run cap:add:ios
npm run cap:ios
```

Para usar o app nativo contra um backend em outro computador/servidor, configure `VITE_API_URL` em `mobile/.env` e ajuste `HOST`, `APP_ORIGINS` e HTTPS do backend. Em produção, a API deve estar publicada em uma origem segura e acessível pelo aparelho.

## Processamento de áudio

A gestão completa funciona sem modelo de IA. Stems/MIDI/partitura/análise dependem das ferramentas descritas em `audio/README.md`. O projeto não inclui pesos de modelos de terceiros.

## Dados

Por padrão:

- `data/sonota.sqlite`: banco;
- `data/uploads/`: arquivos privados;
- `data/jobs/`: temporários de processamento.

Use `npm run backup` com o servidor parado para backup completo.

## Validação desta edição

Nesta edição foram verificados localmente:

- sintaxe dos arquivos Node alterados com `node --check`;
- aplicação das três migrações em um banco SQLite temporário;
- parse/transpilação de todos os arquivos `.js/.jsx` do Ionic React com o parser TypeScript disponível no ambiente.

A instalação completa das dependências Ionic não foi concluída dentro do ambiente de geração por indisponibilidade/timeout do registro npm, então o `vite build` deve ser executado na sua máquina com `npm --prefix mobile install && npm run ui:build`. O projeto está preparado para esse build, mas esta observação evita afirmar uma validação que não foi executada aqui.

## Limites que continuam externos ao protótipo

- recuperação de senha por e-mail exige um provedor de e-mail e fluxo de tokens;
- notificações push exigem configuração Firebase/APNs;
- envio automático com confirmação real de entrega pelo WhatsApp exige WhatsApp Business/Cloud API;
- emissão de NFS-e depende da prefeitura/provedor fiscal e credenciais;
- “Mostrar na pasta” é recurso de desktop nativo, não de navegador/mobile;
- publicação em lojas exige assinatura, ícones/splash, políticas, HTTPS e infraestrutura de backend pública.

Esses itens foram deixados explícitos em vez de serem simulados como se estivessem funcionando.


## Ajustes V2.1
- Identidade visual reaproximada do CSS do Sonota V6 (tema escuro, gradientes laranja/vermelho, cards e menu).
- Login centralizado e sem card de marca separado.
- Menu burger em overlay, com Perfil somente no rodapé.
- Assistente Sonota flutuante redimensionado para caber na viewport.
- Correção do gráfico Fluxo de estúdio.
- Correção de edição de clientes/projetos/arranjos sem reenvio de campos internos.
- Campo de valor de projeto aceita formato brasileiro.
- Mensagens de validação detalhadas e alertas nos cadastros.
- Upload de arranjos passa a aceitar FLAC também no backend.


## Ajustes V2.2
- Shell principal refeito em JSX/HTML com a estrutura visual do Sonota V6; Ionic deixa de definir a aparência da sidebar e da topbar.
- Menu recolhido permanece visível como uma barra lateral de ícones.
- Ícones padronizados em SVG de traço único e espaçamento uniforme entre ícone e rótulo.
- Perfil continua somente no rodapé da sidebar.
- Biblioteca passa a concentrar cadastro e edição de arranjos, além de Download, Editar e Localização por card.
- Página Arranjos renomeada para Laboratório de Arranjos.
- Laboratório dividido em Separação de Stems e Transcrição MIDI/Partitura.
- CSS do Sonota V6 permanece como base visual e componentes Ionic recebem apenas adaptações para não trazer a aparência padrão do framework.

## Atualização V2.3

Esta versão concentra os ajustes visuais e de usabilidade solicitados após a V2.2:

- a rolagem acontece dentro da área principal da aplicação, mantendo a sidebar/botão burger e o Assistente Sonota fixos na viewport;
- o botão `desktop-menu-toggle` foi removido do header; o menu é aberto/recolhido somente pela marca no topo da sidebar;
- o Dashboard passou a usar um único hero de boas-vindas inspirado no protótipo HTML/CSS Sonota V6, com ondas de áudio animadas;
- todos os campos de texto, número, data, seleção e textarea foram padronizados com controles HTML nativos e a mesma identidade do campo de pesquisa de Clientes, eliminando a aparência padrão de inputs Ionic;
- o cadastro/edição de arranjos agora oferece sugestões de tonalidade, gênero, instrumentos e tags, sem impedir digitação livre;
- a Busca Inteligente foi redesenhada como uma conversa com IA, com sugestões de consultas e os principais resultados exibidos abaixo do chat.

### Observação sobre os controles

React e Ionic continuam responsáveis pela lógica e infraestrutura, mas os campos visuais usam HTML nativo (`input`, `select` e `textarea`) estilizado pelo CSS do Sonota. Isso evita diferenças visuais introduzidas pelos Web Components de formulário do Ionic.

## Atualização V2.4

- botões de ação dos cards de **Clientes** e **Projetos** agora usam o mesmo padrão visual `ghost-btn + icon-action` da Biblioteca, com ícones uniformes;
- cards de arranjos da Biblioteca receberam a ação **Excluir**, com confirmação;
- os quatro cards de métricas do Dashboard foram redesenhados a partir da referência `Cards Metrics.png`: ícone em caixa com borda, rótulo, valor em destaque e legenda operacional;
- a marca da sidebar usa os assets oficiais enviados: quando recolhida mostra `sonota-logo-icon.jpg`; quando expandida mostra `sonota-logo-name.png`, sem `span.brand-text`;
- o **Fluxo de estúdio** agora usa a altura das barras para representar a quantidade de projetos criados em cada mês; ao passar o mouse, um tooltip mostra quantidade criada e valor efetivamente recebido no mês;
- botões de cadastro agora usam os textos `+ Cadastrar novo cliente`, `+ Cadastrar novo projeto` e `+ Cadastrar novo arranjo`;
- **Estilo musical** em Projetos agora é um `select` HTML nativo como o campo Etapa;
- Tonalidade e Gênero no cadastro de arranjos usam `select` HTML nativo e mantêm `Outro / personalizado` para entrada manual;
- o chat da Busca Inteligente ficou mais alto para dar mais espaço à conversa.
