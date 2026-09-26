CREATE TABLE users (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL,
 name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'Produtor Musical', studio TEXT NOT NULL DEFAULT '',
 version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 csrf TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at TEXT NOT NULL
) STRICT;
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE files (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), storage_name TEXT NOT NULL UNIQUE,
 original_name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL CHECK(size > 0),
 sha256 TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(id, user_id)
) STRICT;
CREATE TABLE clients (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL,
 type TEXT NOT NULL CHECK(type IN ('Pessoa','Empresa')), company TEXT NOT NULL DEFAULT '',
 email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', document TEXT NOT NULL DEFAULT '',
 city TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL CHECK(status IN ('Ativo','Prospect','Pausado','Inativo')),
 version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(id,user_id)
) STRICT;
CREATE INDEX clients_owner ON clients(user_id, created_at DESC);
CREATE TABLE arrangements (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL,
 file_id TEXT NOT NULL, bpm REAL CHECK(bpm IS NULL OR (bpm >= 20 AND bpm <= 300)),
 musical_key TEXT NOT NULL DEFAULT '', genre TEXT NOT NULL DEFAULT '',
 instruments TEXT NOT NULL DEFAULT '[]', tags TEXT NOT NULL DEFAULT '[]', notes TEXT NOT NULL DEFAULT '',
 duration REAL, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(id,user_id), FOREIGN KEY(file_id,user_id) REFERENCES files(id,user_id)
) STRICT;
CREATE INDEX arrangements_owner ON arrangements(user_id, created_at DESC);
CREATE TABLE arrangement_versions (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL, arrangement_id TEXT NOT NULL,
 file_id TEXT NOT NULL, number INTEGER NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(arrangement_id,number),
 FOREIGN KEY(arrangement_id,user_id) REFERENCES arrangements(id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(file_id,user_id) REFERENCES files(id,user_id)
) STRICT;
CREATE TABLE projects (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL,
 client_id TEXT NOT NULL, arrangement_id TEXT, proposal TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL CHECK(status IN ('Proposta','Em produção','Revisão','Concluído','Cancelado')),
 value_cents INTEGER NOT NULL DEFAULT 0 CHECK(value_cents >= 0), due_date TEXT NOT NULL DEFAULT '',
 paid INTEGER NOT NULL DEFAULT 0 CHECK(paid IN (0,1)),
 version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(id,user_id), FOREIGN KEY(client_id,user_id) REFERENCES clients(id,user_id),
 FOREIGN KEY(arrangement_id,user_id) REFERENCES arrangements(id,user_id)
) STRICT;
CREATE INDEX projects_owner ON projects(user_id, created_at DESC);
CREATE INDEX projects_client ON projects(client_id);
CREATE INDEX projects_arrangement ON projects(arrangement_id);
CREATE TABLE docs (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL, project_id TEXT NOT NULL, file_id TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
 FOREIGN KEY(project_id,user_id) REFERENCES projects(id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(file_id,user_id) REFERENCES files(id,user_id)
) STRICT;
CREATE INDEX docs_owner ON docs(user_id, project_id);
CREATE TABLE jobs (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL, arrangement_id TEXT NOT NULL, source_file_id TEXT NOT NULL,
 type TEXT NOT NULL CHECK(type IN ('analysis','stems','midi','partitura')),
 status TEXT NOT NULL CHECK(status IN ('queued','running','completed','failed','cancelled')),
 output_file_id TEXT, result TEXT, error TEXT, source_version INTEGER NOT NULL,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(arrangement_id,user_id) REFERENCES arrangements(id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(source_file_id,user_id) REFERENCES files(id,user_id),
 FOREIGN KEY(output_file_id,user_id) REFERENCES files(id,user_id)
) STRICT;
CREATE INDEX jobs_queue ON jobs(status, created_at);
CREATE INDEX jobs_owner ON jobs(user_id, arrangement_id);
CREATE TABLE audit (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), entity TEXT NOT NULL,
 entity_id TEXT NOT NULL, action TEXT NOT NULL, details TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
) STRICT;
CREATE INDEX audit_owner ON audit(user_id, created_at DESC);
CREATE TABLE assistant_actions (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), payload TEXT NOT NULL,
 expires_at INTEGER NOT NULL, consumed_at TEXT
) STRICT;
CREATE TABLE embeddings (
 user_id TEXT NOT NULL, arrangement_id TEXT NOT NULL, model TEXT NOT NULL,
 content_hash TEXT NOT NULL, vector TEXT NOT NULL,
 PRIMARY KEY(arrangement_id,model),
 FOREIGN KEY(arrangement_id,user_id) REFERENCES arrangements(id,user_id) ON DELETE CASCADE
) STRICT;
