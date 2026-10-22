# Criação de schemas

O arquivo `creator.sh` é executado assim que o container sobe. Ele procura por arquivos que satisfaçam o glob `*-schema/init.sh`.

Ao encontrar um arquivo desses, chamado de `INITIATOR`, ele