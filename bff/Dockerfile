FROM node:26-alpine3.23

WORKDIR /app

COPY . /app

RUN [ "npm", "i" ]

EXPOSE 3000

CMD [ "npm", "run", "dev" ]