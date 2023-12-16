FROM node:20.10.0

WORKDIR /project

COPY . .

RUN npm install

CMD [ "node", "project/dist/index.js" ]
