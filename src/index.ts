#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createToolDefinitions } from "./tools.js";
import { setupRequestHandlers } from "./requestHandler.js";
import { ensureConfigDirectories } from "./config.js";
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Set up logging to a file instead of console
const logDir = path.join(os.tmpdir(), 'smtp-mcp-server-logs');
try {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
} catch (error) {
  // Silently fail if we can't create the log directory
}

const logFile = path.join(logDir, 'smtp-mcp-server.log');

export function logToFile(message: string): void {
  try {
    fs.appendFileSync(logFile, `${new Date().toISOString()} - ${message}\n`);
  } catch (error) {
    // Silently fail if we can't write to the log file
  }
}

/**
 * Main function to run the SMTP MCP server
 */
async function runServer() {
  try {
    // Ensure config directories exist
    await ensureConfigDirectories();

    // Initialize the server
    const server = new Server(
      {
        name: "smtp-email-server",
        version: "1.0.0",
        description: "SMTP Email MCP Server with template management"
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    // Set error handler
    server.onerror = (error) => logToFile(`[MCP Error] ${error}`);

    // Create tool definitions
    const TOOLS = createToolDefinitions();

    // Setup request handlers
    await setupRequestHandlers(server, TOOLS);

    // Create transport and connect
    const transport = new StdioServerTransport();
    await server.connect(transport);

    logToFile("SMTP MCP Server started successfully");
    
    // Keep the process alive when run directly
    console.log("SMTP MCP Server running. Press Ctrl+C to exit.");
    
    // Handle stdin to keep the process running
    process.stdin.resume();
    
    // Handle process termination
    process.on('SIGINT', () => {
      logToFile("Server shutting down due to SIGINT");
      process.exit(0);
    });
    
    process.on('SIGTERM', () => {
      logToFile("Server shutting down due to SIGTERM");
      process.exit(0);
    });
    
  } catch (error) {
    logToFile(`Server failed to start: ${error}`);
    process.exit(1);
  }
}

// Run the server
runServer().catch((error) => {
  logToFile(`Server failed to start: ${error}`);
  process.exit(1);
}); 