FROM node:9-alpine

ARG NODE_ENV=production

RUN apk update \
 && apk add jq git\
 && rm -rf /var/cache/apk/*

WORKDIR /metering-upwork

COPY package.json  /metering-upwork

RUN yarn install

COPY . /metering-upwork

CMD ["npm","start"]
