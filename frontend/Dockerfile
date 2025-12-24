FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install
# Explicitly install potential missing dependencies as requested
RUN npm install @radix-ui/react-slot lucide-react class-variance-authority clsx tailwind-merge --save-dev

COPY . .

RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
