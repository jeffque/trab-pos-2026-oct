
exec_postgres <<- EOL
    CREATE TABLE IF NOT EXISTS storage (
        id UUID UNIQUE NOT NULL,
        content BYTEA NOT NULL,
        checksum TEXT GENERATED ALWAYS AS (  md5(content)  )
    );
EOL