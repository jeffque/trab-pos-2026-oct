
exec_postgres <<- EOL
    CREATE TABLE IF NOT EXISTS source (
        id UUID UNIQUE NOT NULL,
        name VARCHAR(1023) UNIQUE NOT NULL,
        versions JSONB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS compile_context (
        id UUID UNIQUE NOT NULL,
        name VARCHAR(1023) UNIQUE NOT NULL,
        mainfile VARCHAR(1023) NOT NULL,
        mainversion INTEGER NOT NULL,
        compiled_blob_uuid UUID NULL,
        versions JSONB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS linker_context (
        id UUID UNIQUE NOT NULL,
        linked_blob UUID NULL,
        compiled_values JSONB NOT NULL
    );
EOL