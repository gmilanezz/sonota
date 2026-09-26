ALTER TABLE users ADD COLUMN phone TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN notification_preferences TEXT NOT NULL DEFAULT '{"deadlines":true,"payments":true,"prototypes":true,"documents":true}';

ALTER TABLE clients ADD COLUMN whatsapp TEXT NOT NULL DEFAULT '';

ALTER TABLE projects ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN objective TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN references_text TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN musical_style TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN instruments TEXT NOT NULL DEFAULT '[]';
ALTER TABLE projects ADD COLUMN payment_due_date TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN paid_at TEXT;
ALTER TABLE projects ADD COLUMN completed_at TEXT;

CREATE TABLE project_versions (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL,
 project_id TEXT NOT NULL,
 file_id TEXT NOT NULL,
 label TEXT NOT NULL,
 number INTEGER NOT NULL,
 notes TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'Protótipo' CHECK(status IN ('Protótipo','Revisão','Aprovado','Master')),
 sent_at TEXT,
 created_at TEXT NOT NULL,
 UNIQUE(project_id,number),
 FOREIGN KEY(project_id,user_id) REFERENCES projects(id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(file_id,user_id) REFERENCES files(id,user_id)
) STRICT;
CREATE INDEX project_versions_owner ON project_versions(user_id, project_id, number DESC);

CREATE TABLE project_events (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL,
 project_id TEXT NOT NULL,
 type TEXT NOT NULL,
 message TEXT NOT NULL,
 details TEXT NOT NULL DEFAULT '{}',
 created_at TEXT NOT NULL,
 FOREIGN KEY(project_id,user_id) REFERENCES projects(id,user_id) ON DELETE CASCADE
) STRICT;
CREATE INDEX project_events_owner ON project_events(user_id, project_id, created_at DESC);
