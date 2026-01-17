// Vercel serverless function wrapper for Express app
// This file allows Vercel to run your Express server as serverless functions

// Set Vercel environment flag
process.env.VERCEL = '1';

// Import the Express app from server.js
const app = require('../server.js');

// Export as Vercel serverless function
module.exports = app;

