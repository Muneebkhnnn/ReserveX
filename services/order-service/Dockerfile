FROM node:20-alpine3.19
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate
EXPOSE 4003
CMD ["npm", "start"]
