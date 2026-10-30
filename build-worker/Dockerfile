FROM node:26-alpine3.23

# toolchain C usada pelo worker
RUN [ "apk", "add", "--no-cache", "gcc", "musl-dev" ]

WORKDIR /app

COPY . /app

RUN [ "npm", "i" ]

CMD [ "npm", "run", "dev" ]
