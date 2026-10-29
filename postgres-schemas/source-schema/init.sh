
exec_postgres <<- EOL
    CREATE TABLE IF NOT EXISTS source (
        id UUID UNIQUE NOT NULL,
        blob_id UUID NOT NULL
        name VARCHAR(1023) NOT NULL,
        version INT NOT NULL DEFAULT 1,
        UNIQUE(name, version)
    );
EOL