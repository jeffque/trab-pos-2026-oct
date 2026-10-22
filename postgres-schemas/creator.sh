#!/bin/bash

set -euo pipefail

echo "preparando aqui..."

if [ $# -ge 1 ] && [ "$1" == --debug ]; then
        function exec_postgres() {
                cat -
        }
        BASEDIR=./
else
        function exec_postgres() {
                psql -U postgres
        }
        BASEDIR=`dirname $0`
fi


function create_schema() {
        SCHEMA_NAME="$1"

        echo "começando a criar o schema ${SCHEMA_NAME}"
        exec_postgres <<-EOL
                CREATE SCHEMA IF NOT EXISTS ${SCHEMA_NAME}
EOL
}

(
        cd "$BASEDIR"
        for initiator in *-schema/init.sh; do
                (
                        init_dir="${initiator%/init.sh}"
                        cd "$init_dir"

                        schema_name="${initiator%-schema/init.sh}"
                        create_schema "${schema_name}"
                        source init.sh
                )
        done
)