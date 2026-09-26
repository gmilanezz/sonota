# Análise do projeto recebido

## Proposta compreendida

O Sonota resolve a dificuldade de encontrar e reaproveitar sons em um acervo que cresce junto com os trabalhos do estúdio. O áudio não deve ficar isolado: título, instrumentos, tags, gênero, BPM, tonalidade, observações, cliente e proposta do projeto ajudam o profissional a recuperar o material certo.

O fluxo principal é: cadastrar cliente → armazenar e descrever áudio → relacionar o trabalho a um projeto → acompanhar produção e recebimento → recuperar os sons por pesquisa. A negociação continua podendo ocorrer fora do sistema. A biblioteca e o contexto de produção são o centro da solução.

## Arquivos analisados

O ZIP original tinha 11 entradas: a pasta `Sonota_v6`, sete HTMLs, `styles.css`, `app.js` e `README.md`.

| Arquivo original | Papel | O que foi conectado |
| --- | --- | --- |
| `index.html` | Indicadores e acesso rápido | Dados da conta e indicadores calculados sobre os registros persistidos |
| `clientes.html` | Cadastro, edição, consulta e exclusão | CRUD validado e vínculos reais com projetos |
| `arranjos.html` | Upload, categorização e transcrição | Armazenamento protegido, download, versões e fila de áudio |
| `biblioteca.html` | Filtros do acervo | Biblioteca da conta carregada do servidor |
| `projetos.html` | Proposta, vínculos, valor, prazo e status | Persistência e controle de concorrência |
| `busca-ia.html` | Pesquisa em linguagem natural | API de busca contextual e integração semântica opcional |
| `financeiro.html` | Previsão, recebimentos e anexos | Regras financeiras únicas e substituição transacional de documentos |
| `styles.css` | Identidade visual e responsividade | Visual preservado; complementos em `backend.css` |
| `app.js` | Renderização e lógica local | Reescrito para ler e gravar na API |
| `README.md` | Descrição do protótipo | Substituído por guia de instalação e operação |

## Limitações encontradas no original

1. Os registros existiam somente no `localStorage` daquele navegador.
2. Os arquivos ficavam no IndexedDB, sem armazenamento compartilhado no servidor.
3. Não havia login nem isolamento entre contas.
4. Os exemplos iniciais mencionavam áudios que não acompanhavam o ZIP.
5. A saída MIDI possuía apenas informação de tempo, sem notas transcritas. A partitura era uma pausa. Os stems eram um manifesto JSON.
6. O assistente alterava dados diretamente ao interpretar a frase, inclusive algumas perguntas sobre pagamento.
7. A identificação aproximada poderia escolher silenciosamente entre nomes parecidos.
8. Validações e bloqueios de exclusão dependiam exclusivamente do JavaScript do navegador.
9. A previsão financeira também somava projetos já pagos.
10. A exclusão de projetos não tratava os documentos associados de forma transacional.
11. O dashboard incluía um gráfico decorativo com valores fixos.
12. Não havia controle de edição simultânea, armazenamento de senhas, auditoria, limites de upload ou recuperação de trabalhos interrompidos.

## Decisões de implementação

**Node.js 24 + Express 5:** mantém JavaScript em toda a parte web. O servidor entrega o frontend e a API na mesma origem, simplificando as sessões por cookie.

**SQLite:** banco relacional persistente, com migrações, chaves estrangeiras, transações e modo WAL. Valores monetários são armazenados em centavos inteiros. É apropriado para a execução local do TCC e uma instância de servidor. A aplicação impede duas instâncias usando o mesmo diretório para proteger também o worker e os arquivos.

**Proprietário por registro:** o servidor determina a conta pela sessão, nunca por um `user_id` enviado no formulário. As referências compostas no banco também impedem vincular projeto de uma conta a cliente, áudio ou arquivo de outra.

**Arquivos em disco privado:** o nome físico é gerado pelo servidor; o nome original serve apenas para exibição e download. Arquivos não ficam sob `public/`. O player recebe streaming autenticado com suporte a intervalos de bytes.

**Versão por entidade:** toda edição envia a versão carregada ao abrir o formulário. Se outra edição ocorreu, a resposta é `409 VERSION_CONFLICT`, evitando que uma aba apague silenciosamente a alteração de outra.

**Financeiro a partir de projetos:** não há uma segunda cópia do valor em outra tabela. Recebido é todo valor marcado como pago; concluído a receber são os concluídos não pagos; previsão inclui apenas projetos em andamento não pagos. Cancelados não pagos ficam fora das projeções. Se um projeto pago for cancelado, o dinheiro recebido continua no realizado até o pagamento ser ajustado — cancelar não representa automaticamente um estorno.

**Busca com modo explícito:** filtros objetivos são aplicados antes da ordenação; a busca usa descrições, metadados, propostas e nomes de clientes vinculados. Embeddings são opcionais e mantêm cache por conteúdo e modelo. O sistema não afirma ter ouvido/classificado o áudio apenas porque encontrou palavras nos metadados.

**Assistente com confirmação:** comandos reconhecidos geram uma proposta com valores anteriores e novos. A confirmação tem dono, validade de cinco minutos, uso único e versão do registro. Perguntas não alteram pagamentos; nomes ambíguos geram pedido de esclarecimento.

**Trabalhos de áudio separados:** cada trabalho usa um subprocesso Python e o arquivo fonte específico. Assim, trocar o áudio durante o processamento não muda a entrada do trabalho já iniciado. Resultados são salvos somente depois da execução bem-sucedida. A disponibilidade do modelo e o status do trabalho aparecem na tela.

## Modelo de dados

| Tabela | Relações / finalidade |
| --- | --- |
| `users` | Conta e perfil; senha derivada com scrypt |
| `sessions` | Sessões com token armazenado por hash, CSRF e expiração |
| `clients` | Clientes de uma conta |
| `files` | Metadados, tamanho, hash e localização privada de cada arquivo |
| `arrangements` | Metadados musicais e referência ao arquivo atual |
| `arrangement_versions` | Arquivos históricos de um arranjo |
| `projects` | Cliente, arranjo opcional, proposta, prazo, status e pagamento |
| `docs` | Documento e descrição vinculados ao projeto |
| `jobs` | Tipo, fonte, saída e estado do processamento |
| `embeddings` | Vetores de texto por arranjo, conteúdo e modelo |
| `assistant_actions` | Propostas de alteração pendentes |
| `audit` | Ações de criação, atualização, exclusão e processamento |
| `migrations` | Versões de estrutura aplicadas ao banco |

## Escopo preservado

O envio continha uma aplicação HTML/CSS/JavaScript, não um projeto Ionic. A implementação mantém essas telas. Não foi criada emissão fiscal, cobrança, prospecção automática, envio de mensagens a clientes ou reconhecimento acústico universal. A separação e transcrição reais foram conectadas a bibliotecas especializadas, com instalação independente e limitações explícitas.

## Atualização — interface Ionic React V2

A observação do documento original sobre “Ionic futuro” não se aplica mais à V2 entregue em 26/09/2026. A pasta `mobile/` contém uma interface Ionic React/Vite e configuração Capacitor, consumindo a mesma API do backend. O frontend HTML/JS original permanece apenas como fallback e referência histórica.

A V2 também acrescenta workspace de projeto, versões/protótipos, histórico, WhatsApp/compartilhamento, alertas operacionais, fluxo financeiro mensal, foto de perfil e expansão do Assistente Sonota. Consulte `IMPLEMENTACAO-IONIC-V2.md` para o mapa atualizado.
