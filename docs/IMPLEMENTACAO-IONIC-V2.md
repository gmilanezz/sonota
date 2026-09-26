# Implementação Sonota Ionic React V2

Este documento resume como os requisitos da documentação do Sonota foram convertidos em funcionalidades nesta entrega.

## Princípio de integração

O backend é a fonte única dos dados. Cliente, projeto, arranjo, valor, pagamento, versão e documento não são recadastrados em páginas diferentes. Alterações de projeto refletem no Financeiro, no Dashboard, no Kanban e no histórico.

## Mapa por página

| Página | Entregue |
| --- | --- |
| Login | Cadastro/login/logout, isolamento por conta, sessão e troca de senha |
| Dashboard | Indicadores reais, fluxo 6 meses, alertas, entregas e atividades |
| Clientes | CRUD, WhatsApp, busca e resumo agregado do cliente |
| Projetos | CRUD, briefing, arranjo, Kanban, drag-and-drop e confirmações |
| Detalhes do projeto | Versões, protótipos, histórico, anexos, financeiro e WhatsApp/share |
| Arranjos | Upload, metadados, player, download, IA opcional e versões do áudio |
| Biblioteca | Filtros combinados por propriedades musicais |
| Busca Inteligente | Linguagem natural sobre acervo/contexto, embeddings opcionais |
| Financeiro | Valores dos projetos, recebido/a receber/previsto/atrasado e documentos |
| Assistente | Consultas, fuzzy matching, ações com confirmação e criação de projeto |
| Perfil | Dados, telefone, foto, senha, preferências e exportação |

## Integrações automáticas

1. Criar um projeto faz o card aparecer na etapa selecionada e registra histórico.
2. Alterar o status para Concluído grava a data real de conclusão.
3. Projeto concluído e não pago passa a compor “A receber”.
4. Marcar como recebido grava a data real do recebimento e atualiza o Dashboard.
5. O gráfico usa os últimos seis meses e mantém meses sem movimento com zero.
6. Versões e documentos geram eventos no histórico do projeto.
7. Alertas são recalculados a partir de prazos, pagamentos, versões, documentos e arranjos.
8. O Assistente utiliza as mesmas funções de atualização do restante da aplicação.

## Novas tabelas / campos

As migrações `002_product_workflow.sql` e `003_profile_avatar.sql` acrescentam:

- WhatsApp em clientes;
- descrição/objetivo/referências/estilo/instrumentos em projetos;
- vencimento, data de recebimento e data de conclusão;
- `project_versions`;
- `project_events`;
- telefone/preferências do usuário;
- foto de perfil.

## Escolhas técnicas

- Ionic React para UI mobile/responsiva;
- Vite para desenvolvimento/build;
- Capacitor preparado para Android/iOS;
- Node.js + Express para API;
- SQLite para o protótipo local/TCC;
- armazenamento de arquivos fora de `public/`;
- Python opcional somente para tarefas de áudio especializadas.

## Itens não simulados

Recuperação de senha por e-mail, push notification, NFS-e e confirmação real de entrega do WhatsApp dependem de serviços externos e credenciais. A entrega não cria falsos sucessos para esses recursos.
