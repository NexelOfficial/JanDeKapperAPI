FROM node:lts-alpine
ENV NODE_ENV=development
WORKDIR /usr/src/app
RUN npm install --global nodemon
COPY ["package.json", "package-lock.json*", "npm-shrinkwrap.json*", "./"]
RUN npm install --silent && mv node_modules ../
COPY . .
EXPOSE ${PORT}
RUN chown -R node /usr/src/app
USER root
CMD ["npm", "run","start:dev"]
