
exec_postgres <<- EOL
    CREATE TABLE IF NOT EXISTS ${schema_name}.source (
        id UUID UNIQUE NOT NULL,
        name VARCHAR(1023) UNIQUE NOT NULL,
        versions JSONB NOT NULL
    );

    -- pedidos de compilação/assembly: criados pelo source-service, concluídos pelo build-worker
    CREATE TABLE IF NOT EXISTS ${schema_name}.build (
        id UUID PRIMARY KEY,
        source_id UUID NOT NULL REFERENCES ${schema_name}.source (id),
        version INTEGER NOT NULL,
        kind VARCHAR(16) NOT NULL,
        status VARCHAR(16) NOT NULL,
        blob_id UUID,
        size INTEGER,
        log TEXT,
        correlation_id VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        finished_at TIMESTAMPTZ
    );
EOL
