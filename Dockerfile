# Use an official Node.js runtime as a parent image
FROM node:alpine3.11

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install dependencies
RUN npm install

# Bundle app source
COPY . .

# Expose the port on which your Node.js app runs
EXPOSE 3000

# Command to run your Node.js application
CMD ["npm", "start"]
