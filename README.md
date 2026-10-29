# Projeto

Serviço de blob:

- POST blob
    - retorna o UUID
- GET UUID
    - retorna o blob
- DELETE UUID
    - remove o blob


Serviço de fonte:

- POST fonte
    - payload
        - nome
        - blob (textual)
    - retorno
        - versão criada (1)
        - uuid
- GET uuid
    - nome
    - blob-uuid
    - version
    - em um json só
- GET /content/:nome/:version
    - resgata o conteúdo