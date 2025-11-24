#!/usr/bin/env node

/**
 * Email MCP Server - Clean, flexible email operations
 * Supports both SMTP (sending) and IMAP (reading) operations
 */

import 'dotenv/config';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { EMAIL_TOOLS } from "./emailTools.js";
import {
  handleEmailsFind,
  handleEmailsModify,
  handleEmailSend,
  handleEmailRespond,
  handleFoldersList
} from "./emailHandlers.js";
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Set up logging
const logDir = path.join(os.tmpdir(), 'email-mcp-server-logs');
try {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
} catch (error) {
  // Silently fail if we can't create the log directory
}

const logFile = path.join(logDir, 'email-mcp-server.log');

function logToFile(message: string): void {
  try {
    fs.appendFileSync(logFile, `${new Date().toISOString()} - ${message}\n`);
  } catch (error) {
    // Silently fail if we can't write to the log file
  }
}

/**
 * Main server function
 */
async function runServer() {
  try {
    // Initialize the server
    const server = new Server(
      {
        name: "email-server",
        version: "2.0.2"
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Set error handler
    server.onerror = (error) => logToFile(`[MCP Error] ${error}`);

    // Handle list tools request
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: Object.values(EMAIL_TOOLS)
      };
    });

    // Handle tool calls
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        let result: string;

        switch (name) {
          case "emails_find":
            result = await handleEmailsFind(args);
            break;
          
          case "emails_modify":
            result = await handleEmailsModify(args);
            break;
          
          case "email_send":
            result = await handleEmailSend(args);
            break;
          
          case "email_respond":
            result = await handleEmailRespond(args);
            break;
          
          case "folders_list":
            result = await handleFoldersList(args);
            break;
          
          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        return {
          content: [
            {
              type: "text",
              text: result
            }
          ]
        };

      } catch (error: any) {
        logToFile(`Error handling ${name}: ${error.message}`);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: error.message || 'Unknown error occurred'
              }, null, 2)
            }
          ],
          isError: true
        };
      }
    });

    // Create transport and connect
    const transport = new StdioServerTransport();
    await server.connect(transport);

    logToFile("Email MCP Server started successfully");

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