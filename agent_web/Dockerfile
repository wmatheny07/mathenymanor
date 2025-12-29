FROM node:20 AS build
WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# Copy source
COPY . .

# Accept build argument from docker-compose
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# Print to verify
RUN echo ">>> VITE_API_URL = $VITE_API_URL"

# Build with Vite
RUN npm run build

FROM nginx:stable-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]