#!/usr/bin/env node

// Direct Smithery API publishing script
// This attempts to publish the package directly via the Smithery API
// if the CLI methods don't work

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createReadStream } from 'fs';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';

const exec = promisify(execCallback);

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Load API key from .env file
function loadEnv() {
  try {
    const envPath = path.join(rootDir, '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const lines = envContent.split('\n');
      const env = {};
      
      for (const line of lines) {
        if (line.trim() && !line.startsWith('#')) {
          const [key, ...valueParts] = line.split('=');
          const value = valueParts.join('=').trim();
          env[key.trim()] = value;
        }
      }
      
      return env;
    }
  } catch (error) {
    console.error('Error loading .env file:', error);
  }
  
  return {};
}

// Main function
async function main() {
  console.log('🔄 Attempting to publish directly to Smithery API...');
  
  // Load environment variables
  const env = loadEnv();
  const apiKey = env.SMITHERY_API_KEY;
  
  if (!apiKey) {
    console.error('❌ Error: SMITHERY_API_KEY not found in .env file');
    process.exit(1);
  }
  
  // Ensure the project is built
  console.log('🔨 Building the project...');
  await exec('npm run build');
  
  // Create a temporary directory
  console.log('📦 Creating package for Smithery...');
  const { stdout: tempDirOutput } = await exec('mktemp -d');
  const tempDir = tempDirOutput.trim();
  const packageDir = path.join(tempDir, 'mcp-smtp-server');
  
  await exec(`mkdir -p "${packageDir}"`);
  
  // Copy necessary files
  console.log('📋 Copying files...');
  await exec(`cp -R build "${packageDir}/"`);
  await exec(`cp smithery.yaml "${packageDir}/"`);
  await exec(`cp package.json README.md "${packageDir}/"`);
  
  // Create scripts directory
  await exec(`mkdir -p "${packageDir}/scripts"`);
  await exec(`cp scripts/start-smithery.js "${packageDir}/scripts/"`);
  
  // Create Smithery metadata
  console.log('📝 Creating Smithery metadata...');
  fs.writeFileSync(
    path.join(packageDir, 'smithery.json'),
    JSON.stringify({
      name: 'mcp-smtp-server',
      version: '1.0.0',
      description: 'SMTP Email MCP Server with template management',
      smithery: {
        displayName: 'SMTP Email Server',
        description: 'Send emails with template support via SMTP',
        startCommand: {
          type: 'stdio',
          command: 'node',
          args: ['scripts/start-smithery.js']
        }
      }
    }, null, 2)
  );
  
  // Create tarball
  console.log('📦 Creating tarball...');
  process.chdir(tempDir);
  await exec('tar -czf mcp-smtp-server.tgz mcp-smtp-server');
  const tarballPath = path.join(tempDir, 'mcp-smtp-server.tgz');
  
  // Return to original directory
  process.chdir(rootDir);
  
  // Try direct API call using curl
  console.log('🚀 Sending direct API request to Smithery...');
  try {
    const { stdout, stderr } = await exec(`
      curl -X POST 'https://api.smithery.ai/v1/teams/default/servers' \\
      -H 'Authorization: Bearer ${apiKey}' \\
      -H 'Content-Type: multipart/form-data' \\
      -F 'package=@${tarballPath}' \\
      -F 'id=mcp-smtp-server' \\
      -F 'description=SMTP Email MCP Server with template management'
    `);
    
    console.log('API Response:', stdout);
    if (stderr) {
      console.error('API Error:', stderr);
    }
    
    if (stdout.includes('"success"') || stdout.includes('"id"')) {
      console.log('✅ Successfully published to Smithery API!');
    } else {
      console.log('⚠️ Uncertain if publication succeeded. Check the response above.');
    }
  } catch (error) {
    console.error('❌ Error sending API request:', error.message);
    console.log('API might be unavailable or does not support direct package uploads.');
  }
  
  // Clean up
  console.log('🧹 Cleaning up temporary files...');
  await exec(`rm -rf "${tempDir}"`);
  
  console.log('📌 Publication attempt completed.');
}

// Run the main function
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});