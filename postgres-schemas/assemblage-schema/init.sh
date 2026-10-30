
exec_postgres <<- EOL
    -- conjunto de arquivos objeto (de workspaces compilados) linkado num executável
    CREATE TABLE IF NOT EXISTS ${schema_name}.assemblage (
        id UUID PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        -- na_fila -> pronto | erro
        status VARCHAR(16) NOT NULL DEFAULT 'na_fila',
        blob_id UUID,
        size INTEGER,
        log TEXT,
        correlation_id VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        finished_at TIMESTAMPTZ
    );

    -- foto dos objetos usados: se o workspace recompilar depois, esta assemblagem não muda
    CREATE TABLE IF NOT EXISTS ${schema_name}.assemblage_object (
        assemblage_id UUID NOT NULL REFERENCES ${schema_name}.assemblage (id) ON DELETE CASCADE,
        workspace_id UUID NOT NULL,
        workspace_name VARCHAR(255) NOT NULL,
        object_blob_id UUID NOT NULL,
        PRIMARY KEY (assemblage_id, workspace_id)
    );
EOL
