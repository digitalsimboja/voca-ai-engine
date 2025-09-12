# Use Node.js 18 Alpine as base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY services/voca-os/package.json ./package.json
RUN npm install

# Copy Voca OS service files
COPY services/voca-os/voca-os-service.js ./voca-os-service.js
COPY services/voca-os/src ./src
COPY services/voca-os/characters ./characters

# Create dynamic characters directory
RUN mkdir -p characters/dynamic

# Expose port
EXPOSE 5001

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5001

# Start the Voca OS service
CMD ["node", "voca-os-service.js"]
