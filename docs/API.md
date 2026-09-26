# API Sonota

Base local: `http://localhost:3000/api`. Respostas JSON usam UTF-8. Uploads usam `multipart/form-data`. Todas as rotas de dados exigem sessão da conta.

## Autenticação

`POST /auth/register` recebe `name`, `email`, `password`, `studio` opcional e `role` opcional. `POST /auth/login` recebe `email` e `password`. A resposta contém `user` e `csrf`; o token da sessão vai no cookie `sonota_session`, HttpOnly e SameSite=Lax.

Nas gravações autenticadas, envie `X-CSRF-Token` com o valor recebido no login ou em `GET /auth/me`. O navegador já faz isso em `public/api.js`. A API confere a origem nas requisições que possuem o cabeçalho `Origin`.

```javascript
const login = await fetch('/api/auth/login', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({email: 'seu-email@exemplo.com', password: 'sua-senha'})
}).then(r => r.json());

const response = await fetch('/api/clients', {
  method: 'POST',
  headers: {'Content-Type': 'application/json', 'X-CSRF-Token': login.csrf},
  body: JSON.stringify({name: 'Cliente exemplo', type: 'Empresa', email: 'cliente@exemplo.com'})
});
```

O servidor ignora a ideia de proprietário enviado pelo cliente: os schemas estritos recusam propriedades desconhecidas, inclusive `user_id`.

## Rotas

| Método | Caminho | Uso |
| --- | --- | --- |
| GET | `/health` | Disponibilidade do servidor; público |
| GET | `/auth/options` | Cadastro disponível; público |
| POST | `/auth/register` | Criar conta; público |
| POST | `/auth/login` | Entrar; público |
| POST | `/auth/logout` | Encerrar sessão atual |
| GET | `/auth/me` | Perfil e CSRF da sessão |
| POST | `/auth/password` | `currentPassword`, `newPassword`; revoga outras sessões |
| PATCH | `/profile` | Perfil e `version`; `currentPassword` para mudar e-mail |
| GET | `/bootstrap` | Dados completos da conta para as telas atuais |
| GET | `/dashboard` | Indicadores e cinco projetos recentes |
| GET | `/finance/summary` | `received`, `receivable`, `forecast` em reais |
| GET/POST | `/clients` | Listar/criar clientes |
| GET/PATCH/DELETE | `/clients/:id` | Consultar/editar/excluir cliente |
| GET/POST | `/arrangements` | Listar/criar arranjos; criação com upload |
| GET/PATCH/DELETE | `/arrangements/:id` | Consultar/editar/excluir arranjo |
| GET | `/arrangements/:id/versions` | Histórico dos arquivos de áudio |
| GET/POST | `/projects` | Listar/criar projetos |
| GET/PATCH/DELETE | `/projects/:id` | Consultar/editar/excluir projeto |
| PATCH | `/projects/:id/finance` | Alterar pagamento e anexar/substituir documentos em uma transação |
| GET/POST | `/documents` | Listar/anexar documentos |
| DELETE | `/documents/:id` | Excluir documento |
| GET | `/files/:id` | Conteúdo autenticado; áudio aceita `Range` |
| GET | `/files/:id?download=1` | Download com o nome original |
| POST | `/search` | Pesquisa: `query` e `limit` opcional |
| POST | `/assistant/message` | Interpretar `message`; pode retornar proposta de alteração |
| POST | `/assistant/actions/:id/confirm` | Aplicar a proposta ainda válida |
| GET | `/capabilities` | Recursos de áudio detectados e embeddings configurados |
| GET/POST | `/jobs` | Listar/criar trabalhos de áudio |
| POST | `/jobs/:id/cancel` | Cancelar trabalho em espera ou execução |
| DELETE | `/jobs/:id` | Excluir trabalho finalizado e saída, se houver |
| GET | `/audit` | Histórico de ações da conta, até os mil registros mais recentes |
| GET | `/export` | Download dos registros da conta em JSON, sem arquivos binários |

`GET /clients`, `/arrangements` e `/projects` aceitam `q`, `page`, `limit`; clientes e projetos também aceitam `status`. Documentos e auditoria têm `page` e `limit`. O limite máximo por página é 100. Resposta: `{items, total, page, limit}`. `/bootstrap` carrega o conjunto completo usado pelas telas deste projeto.

## Entidades

**Cliente:** `name`, `type` (`Pessoa`/`Empresa`), `company`, `email`, `phone`, `document`, `city`, `notes`, `status` (`Ativo`/`Prospect`/`Pausado`/`Inativo`). Nome obrigatório; demais campos têm os defaults definidos em `src/validation.js`.

**Arranjo:** `title`, `bpm` (20–300 ou `null`), `key` (ex.: `C`, `Am`, `F#m`, ou vazio), `genre`, `instruments` (array), `tags` (array), `notes`. O servidor determina `fileId`, `fileName`, `fileType`, `size` e `duration`. Nome e arquivo são obrigatórios na criação; metadados musicais podem ser preenchidos depois.

**Projeto:** `name`, `clientId`, `arrangementId` (UUID ou vazio), `proposal`, `status` (`Proposta`/`Em produção`/`Revisão`/`Concluído`/`Cancelado`), `value` (reais, até duas casas decimais), `dueDate` (`AAAA-MM-DD` ou vazio), `paid` (booleano). Cliente e nome são obrigatórios. Referências de outra conta são recusadas.

**Perfil:** `name`, `role`, `studio`, `email`, `version`; `currentPassword` para mudança de e-mail.

## Edições e exclusões

As entidades retornam `id`, `version`, `createdAt` e `updatedAt`. PATCH envia apenas os campos alterados **mais `version`**. Uma versão desatualizada retorna `409`. Campos omitidos não são apagados nem reinicializados.

```json
{"status":"Concluído","version":1}
```

DELETE de cliente, arranjo e projeto exige o cabeçalho `If-Match` com o número simples da versão, por exemplo `If-Match: 2`. Cliente/arranjo vinculado a um projeto não pode ser removido. Excluir projeto remove seus documentos; excluir arranjo remove versões e resultados após o encerramento dos trabalhos ativos.

## Uploads

O corpo multipart contém `metadata` (JSON serializado) e um único campo `file`. Exemplo:

```javascript
const form = new FormData();
form.append('metadata', JSON.stringify({
  title: 'Piano suave', bpm: 90, key: 'C',
  genre: 'Ambient', instruments: ['piano'], tags: ['leve'], notes: ''
}));
form.append('file', input.files[0]);
await fetch('/api/arrangements', {
  method: 'POST', headers: {'X-CSRF-Token': csrf}, body: form
});
```

Não defina manualmente o `Content-Type` de FormData. O navegador inclui o boundary.

Para substituir áudio, faça PATCH multipart no arranjo com `version` e os metadados desejados. A versão anterior continua no histórico. Para editar só metadados, use JSON.

Documento: `metadata` contém `projectId` e `description`; o arquivo deve ser PDF, PNG, JPG/JPEG ou XML. Financeiro: `metadata` contém `paid`, `version`, `mode` (`add`/`replace`) e `description`. `replace` exige um arquivo novo; pagamento e substituição são gravados juntos, depois de validar o upload. Anexar/excluir documentos também incrementa a versão do projeto.

## Busca e assistente

`POST /search` recebe `{"query":"bpm 120 a 150 com synth e tensão","limit":10}`. A resposta inclui `mode` (`metadata`/`hybrid`), `notice`, `criteria`, `total` e `results`. Cada resultado tem `arrangement`, `linked`, `relevance` e `matched`. Relevância é uma classificação para ordenação, não probabilidade.

Exemplos adicionais: `piano leve`, `120 bpm tom Am`, `synth sem bateria`, nomes e palavras da proposta de um projeto. A modalidade de busca efetivamente usada é sempre informada.

O assistente recebe `{"message":"muda Campanha Aurora pra concluído"}`. Se houver alteração reconhecida, retorna `action.id`, mudanças e validade. Confirmar a ação é uma segunda requisição explícita. Ações de outra conta, expiradas, já utilizadas ou referentes a uma versão antiga são recusadas.

## Trabalhos de áudio

Criação: `{"arrangementId":"UUID","type":"analysis"}`. Tipos: `analysis`, `stems`, `midi`, `partitura`. Retorna `202` com o trabalho. Consulte `GET /jobs` para acompanhar `queued`, `running`, `completed`, `failed` ou `cancelled`. Um trabalho concluído pode fornecer `fileId` para download, ou `result` para estimativas de BPM e tonalidade.

Sem o recurso instalado/habilitado, a criação retorna `503 AUDIO_UNAVAILABLE` e não cria uma saída fictícia.

## Erros

Formato: `{"error":{"code":"...","message":"...","details":[...]}}`.

| HTTP | Significado |
| --- | --- |
| 400 | JSON, multipart ou operação inválida |
| 401 | Sem sessão ou credenciais incorretas |
| 403 | Origem, CSRF ou senha de confirmação recusada |
| 404 | Registro/arquivo não encontrado na conta |
| 409 | Versão conflitante, vínculo em uso ou proposta inválida |
| 413 | Limite de upload, corpo ou quota excedido |
| 415 | Extensão ou assinatura de arquivo incompatível |
| 422 | Campos inválidos ou áudio sem conteúdo legível |
| 429 | Limite de requisições ou trabalhos pendentes |
| 503 | Modelo de áudio indisponível |

Campos detalhados em erros de validação ajudam a localizar o problema no formulário. Erros internos não expõem stack trace ao navegador.
