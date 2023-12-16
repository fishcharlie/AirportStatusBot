FROM node:20.10.0

WORKDIR /project

COPY package*.json ./

RUN npm install

COPY . .

CMD [ "node", "project/dist/index.js" ]
