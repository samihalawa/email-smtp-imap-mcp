#!/usr/bin/env node

// Start script for Smithery integration
// This script provides a bridge between Smithery and the MCP server
// It reads configuration from environment variables or command-line arguments

import { spawn } from 'child_process';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

// Parse command-line arguments
const args = process.argv.slice(2);
const options = {};
args.forEach(arg => {
  if (arg.startsWith('--')) {
    const [key, value] = arg.slice(2).split('=');
    options[key] = value !== undefined ? value : true;
  }
});

// Environment variables take precedence over command-line arguments
const port = process.env.PORT || options.port || 8082;
const debug = process.env.DEBUG === 'true' || options.debug === 'true';
const smtpHost = process.env.SMTP_HOST || options.smtpHost || 'smtp.example.com';
const smtpPort = process.env.SMTP_PORT || options.smtpPort || 587;
const smtpSecure = process.env.SMTP_SECURE === 'true' || options.smtpSecure === 'true';
const smtpUser = process.env.SMTP_USER || options.smtpUser || '';
const smtpPass = process.env.SMTP_PASS || options.smtpPass || '';

// Set environment variables for the child process
const env = {
  ...process.env,
  PORT: port.toString(),
  DEBUG: debug.toString(),
  SMTP_HOST: smtpHost,
  SMTP_PORT: smtpPort.toString(),
  SMTP_SECURE: smtpSecure.toString(),
  SMTP_USER: smtpUser,
  SMTP_PASS: smtpPass
};

// Log the configuration
if (debug) {
  console.log('Starting SMTP MCP Server with configuration:');
  console.log(`- Port: ${port}`);
  console.log(`- Debug: ${debug}`);
  console.log(`- SMTP Host: ${smtpHost}`);
  console.log(`- SMTP Port: ${smtpPort}`);
  console.log(`- SMTP Secure: ${smtpSecure}`);
  console.log(`- SMTP User: ${smtpUser ? '(provided)' : '(not provided)'}`);
  console.log(`- SMTP Password: ${smtpPass ? '(provided)' : '(not provided)'}`);
}

// Start the MCP server
const serverProcess = spawn('node', [resolve(rootDir, 'build/index.js')], {
  env,
  stdio: 'inherit'
});

// Handle process events
serverProcess.on('error', (err) => {
  console.error(`Failed to start MCP server: ${err.message}`);
  process.exit(1);
});

serverProcess.on('exit', (code, signal) => {
  if (code !== 0) {
    console.error(`MCP server exited with code ${code} and signal ${signal}`);
    process.exit(code || 1);
  }
});

// Forward signals to the child process
process.on('SIGINT', () => {
  serverProcess.kill('SIGINT');
});

process.on('SIGTERM', () => {
  serverProcess.kill('SIGTERM');
});