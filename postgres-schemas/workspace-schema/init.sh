
exec_postgres <<- EOL
    -- conjunto de fontes (.c e .h, cada uma numa revisão fixa) que vira um arquivo objeto
    CREATE TABLE IF NOT EXISTS ${schema_name}.workspace (
        id UUID PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        -- rascunho -> na_fila -> compilado | erro
        status VARCHAR(16) NOT NULL DEFAULT 'rascunho',
        object_blob_id UUID,
        object_size INTEGER,
        log TEXT,
        correlation_id VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        queued_at TIMESTAMPTZ,
        compiled_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS ${schema_name}.workspace_file (
        workspace_id UUID NOT NULL REFERENCES ${schema_name}.workspace (id) ON DELETE CASCADE,
        source_id UUID NOT NULL,
        name VARCHAR(1023) NOT NULL,
        version INTEGER NOT NULL,
        PRIMARY KEY (workspace_id, source_id)
    );
EOL
