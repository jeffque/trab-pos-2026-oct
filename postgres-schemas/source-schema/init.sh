
exec_postgres <<- EOL
    CREATE TABLE IF NOT EXISTS source (
        id UUID UNIQUE NOT NULL,
        name VARCHAR(1023) UNIQUE NOT NULL,
        versions JSONB NOT NULL
    );
EOL