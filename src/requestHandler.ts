import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { 
  Tool, 
  CallToolRequestSchema, 
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import {
  getSmtpConfigs,
  saveSmtpConfigs,
  getEmailTemplates,
  saveEmailTemplate,
  deleteEmailTemplate,
  SmtpServerConfig,
  EmailTemplate,
  getEmailLogs,
  EmailLogEntry
} from "./config.js";
import {
  sendEmail,
  sendBulkEmails,
  EmailData,
  BulkEmailData,
  EmailRecipient
} from "./emailService.js";
import { logToFile } from "./index.js";

/**
 * Generate a UUID
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Setup request handlers for the MCP server
 */
export async function setupRequestHandlers(
  server: Server,
  tools: Record<string, Tool>,
): Promise<void> {
  // Handle tool listing
  server.setRequestHandler(
    ListToolsRequestSchema,
    async () => {
      return {
        tools: Object.values(tools),
      };
    }
  );

  // Handle tool calls
  server.setRequestHandler(
    CallToolRequestSchema,
    async (request) => {
      const toolName = request.params.name;
      const toolParams = request.params.arguments || {};

      // Check if the tool exists
      if (!tools[toolName]) {
        throw new Error(`Tool '${toolName}' not found`);
      }

      // Execute the tool based on its name
      switch (toolName) {
        case "send-email":
          return await handleSendEmail(toolParams);
        
        case "send-bulk-emails":
          return await handleSendBulkEmails(toolParams);
        
        case "get-smtp-configs":
          return await handleGetSmtpConfigs();
        
        case "add-smtp-config":
          return await handleAddSmtpConfig(toolParams);
        
        case "update-smtp-config":
          return await handleUpdateSmtpConfig(toolParams);
        
        case "delete-smtp-config":
          return await handleDeleteSmtpConfig(toolParams);
        
        case "get-email-templates":
          return await handleGetEmailTemplates();
        
        case "add-email-template":
          return await handleAddEmailTemplate(toolParams);
        
        case "update-email-template":
          return await handleUpdateEmailTemplate(toolParams);
        
        case "delete-email-template":
          return await handleDeleteEmailTemplate(toolParams);
        
        case "get-email-logs": {
          const { limit, filterBySuccess } = toolParams as { 
            limit?: number;
            filterBySuccess?: boolean;
          };
          
          try {
            let logs = await getEmailLogs();
            
            // Filter by success status if specified
            if (filterBySuccess !== undefined) {
              logs = logs.filter((log: EmailLogEntry) => log.success === filterBySuccess);
            }
            
            // Sort by timestamp in descending order (newest first)
            logs = logs.sort((a: EmailLogEntry, b: EmailLogEntry) => 
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );
            
            // Limit the number of results if specified
            if (limit && limit > 0) {
              logs = logs.slice(0, limit);
            }
            
            return {
              result: logs
            };
          } catch (error) {
            logToFile(`Error getting email logs: ${error}`);
            throw new Error("Failed to retrieve email logs");
          }
        }
        
        default:
          throw new Error(`Tool '${toolName}' exists but no handler is implemented`);
      }
    }
  );
}

/**
 * Handle send-email tool call
 */
async function handleSendEmail(parameters: any) {
  try {
    // If "to" is a single object, convert it to an array
    const to = Array.isArray(parameters.to) ? parameters.to : [parameters.to];
    
    // Prepare the email data
    const emailData: EmailData = {
      to: to,
      subject: parameters.subject,
      body: parameters.body,
      from: parameters.from,
      cc: parameters.cc,
      bcc: parameters.bcc,
      templateId: parameters.templateId,
      templateData: parameters.templateData
    };
    
    // Send the email
    const result = await sendEmail(emailData, parameters.smtpConfigId);
    
    return {
      success: result.success,
      message: result.message
    };
  } catch (error) {
    logToFile('Error in handleSendEmail:');
    logToFile(error instanceof Error ? error.message : 'Unknown error');
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Handle send-bulk-emails tool call
 */
async function handleSendBulkEmails(parameters: any) {
  try {
    // Prepare the bulk email data
    const bulkEmailData: BulkEmailData = {
      recipients: parameters.recipients,
      subject: parameters.subject,
      body: parameters.body,
      from: parameters.from,
      cc: parameters.cc,
      bcc: parameters.bcc,
      templateId: parameters.templateId,
      templateData: parameters.templateData,
      batchSize: parameters.batchSize,
      delayBetweenBatches: parameters.delayBetweenBatches
    };
    
    // Send the bulk emails
    const result = await sendBulkEmails(bulkEmailData, parameters.smtpConfigId);
    
    return {
      success: result.success,
      totalSent: result.totalSent,
      totalFailed: result.totalFailed,
      failures: result.failures,
      message: result.message
    };
  } catch (error) {
    logToFile('Error in handleSendBulkEmails:');
    logToFile(error instanceof Error ? error.message : 'Unknown error');
    return {
      success: false,
      totalSent: 0,
      totalFailed: parameters.recipients?.length || 0,
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Handle get-smtp-configs tool call
 */
async function handleGetSmtpConfigs() {
  try {
    const configs = await getSmtpConfigs();
    
    return {
      success: true,
      configs: configs
    };
  } catch (error) {
    logToFile('Error in handleGetSmtpConfigs:');
    logToFile(error instanceof Error ? error.message : 'Unknown error');
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Handle add-smtp-config tool call
 */
async function handleAddSmtpConfig(parameters: any) {
  try {
    // Get existing configs
    const configs = await getSmtpConfigs();
    
    // Create a new config
    const newConfig: SmtpServerConfig = {
      id: generateUUID(),
      name: parameters.name,
      host: parameters.host,
      port: parameters.port,
      secure: parameters.secure ?? false,
      auth: {
        user: parameters.user,
        pass: parameters.pass
      },
      isDefault: parameters.isDefault ?? false
    };
    
    // If this is set as default, update other configs
    if (newConfig.isDefault) {
      configs.forEach(config => {
        config.isDefault = false;
      });
    }
    
    // Add the new config to the list
    configs.push(newConfig);
    
    // Save the updated configs
    await saveSmtpConfigs(configs);
    
    return {
      success: true,
      config: newConfig
    };
  } catch (error) {
    logToFile('Error in handleAddSmtpConfig:');
    logToFile(error instanceof Error ? error.message : 'Unknown error');
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Handle update-smtp-config tool call
 */
async function handleUpdateSmtpConfig(parameters: any) {
  try {
    // Get existing configs
    const configs = await getSmtpConfigs();
    
    // Find the config to update
    const configIndex = configs.findIndex(config => config.id === parameters.id);
    
    if (configIndex === -1) {
      return {
        success: false,
        message: `SMTP configuration with ID ${parameters.id} not found`
      };
    }
    
    // Update the config
    const updatedConfig = { ...configs[configIndex] };
    
    if (parameters.name !== undefined) updatedConfig.name = parameters.name;
    if (parameters.host !== undefined) updatedConfig.host = parameters.host;
    if (parameters.port !== undefined) updatedConfig.port = parameters.port;
    if (parameters.secure !== undefined) updatedConfig.secure = parameters.secure;
    if (parameters.user !== undefined) updatedConfig.auth.user = parameters.user;
    if (parameters.pass !== undefined) updatedConfig.auth.pass = parameters.pass;
    
    // Handle default flag
    if (parameters.isDefault !== undefined) {
      updatedConfig.isDefault = parameters.isDefault;
      
      // If setting as default, update other configs
      if (updatedConfig.isDefault) {
        configs.forEach((config, index) => {
          if (index !== configIndex) {
            config.isDefault = false;
          }
        });
      }
    }
    
    // Update the config in the list
    configs[configIndex] = updatedConfig;
    
    // Save the updated configs
    await saveSmtpConfigs(configs);
    
    return {
      success: true,
      config: updatedConfig
    };
  } catch (error) {
    logToFile('Error in handleUpdateSmtpConfig:');
    logToFile(error instanceof Error ? error.message : 'Unknown error');
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Handle delete-smtp-config tool call
 */
async function handleDeleteSmtpConfig(parameters: any) {
  try {
    // Get existing configs
    const configs = await getSmtpConfigs();
    
    // Find the config to delete
    const configIndex = configs.findIndex(config => config.id === parameters.id);
    
    if (configIndex === -1) {
      return {
        success: false,
        message: `SMTP configuration with ID ${parameters.id} not found`
      };
    }
    
    // Check if trying to delete the only config
    if (configs.length === 1) {
      return {
        success: false,
        message: 'Cannot delete the only SMTP configuration'
      };
    }
    
    // Check if deleting the default config
    const isDefault = configs[configIndex].isDefault;
    
    // Remove the config from the list
    configs.splice(configIndex, 1);
    
    // If deleting the default config, set another one as default
    if (isDefault && configs.length > 0) {
      configs[0].isDefault = true;
    }
    
    // Save the updated configs
    await saveSmtpConfigs(configs);
    
    return {
      success: true,
      message: 'SMTP configuration deleted successfully'
    };
  } catch (error) {
    logToFile('Error in handleDeleteSmtpConfig:');
    logToFile(error instanceof Error ? error.message : 'Unknown error');
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Handle get-email-templates tool call
 */
async function handleGetEmailTemplates() {
  try {
    const templates = await getEmailTemplates();
    
    return {
      success: true,
      templates: templates
    };
  } catch (error) {
    logToFile('Error in handleGetEmailTemplates:');
    logToFile(error instanceof Error ? error.message : 'Unknown error');
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Handle add-email-template tool call
 */
async function handleAddEmailTemplate(parameters: any) {
  try {
    // Get existing templates
    const templates = await getEmailTemplates();
    
    // Create a new template
    const newTemplate: EmailTemplate = {
      id: generateUUID(),
      name: parameters.name,
      subject: parameters.subject,
      body: parameters.body,
      isDefault: parameters.isDefault ?? false
    };
    
    // If this is set as default, we'll need to update other templates
    if (newTemplate.isDefault) {
      templates.forEach(template => {
        if (template.isDefault) {
          template.isDefault = false;
          saveEmailTemplate(template).catch(err => {
            logToFile('Error updating template:');
            logToFile(err instanceof Error ? err.message : 'Unknown error');
          });
        }
      });
    }
    
    // Save the new template
    await saveEmailTemplate(newTemplate);
    
    return {
      success: true,
      template: newTemplate
    };
  } catch (error) {
    logToFile('Error in handleAddEmailTemplate:');
    logToFile(error instanceof Error ? error.message : 'Unknown error');
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Handle update-email-template tool call
 */
async function handleUpdateEmailTemplate(parameters: any) {
  try {
    // Get existing templates
    const templates = await getEmailTemplates();
    
    // Find the template to update
    const template = templates.find(t => t.id === parameters.id);
    
    if (!template) {
      return {
        success: false,
        message: `Email template with ID ${parameters.id} not found`
      };
    }
    
    // Update the template
    const updatedTemplate = { ...template };
    
    if (parameters.name !== undefined) updatedTemplate.name = parameters.name;
    if (parameters.subject !== undefined) updatedTemplate.subject = parameters.subject;
    if (parameters.body !== undefined) updatedTemplate.body = parameters.body;
    
    // Handle default flag
    if (parameters.isDefault !== undefined && parameters.isDefault !== template.isDefault) {
      updatedTemplate.isDefault = parameters.isDefault;
      
      // If setting as default, update other templates
      if (updatedTemplate.isDefault) {
        templates.forEach(t => {
          if (t.id !== parameters.id && t.isDefault) {
            t.isDefault = false;
            saveEmailTemplate(t).catch(err => {
              logToFile('Error updating template:');
              logToFile(err instanceof Error ? err.message : 'Unknown error');
            });
          }
        });
      }
    }
    
    // Save the updated template
    await saveEmailTemplate(updatedTemplate);
    
    return {
      success: true,
      template: updatedTemplate
    };
  } catch (error) {
    logToFile('Error in handleUpdateEmailTemplate:');
    logToFile(error instanceof Error ? error.message : 'Unknown error');
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Handle delete-email-template tool call
 */
async function handleDeleteEmailTemplate(parameters: any) {
  try {
    // Get existing templates
    const templates = await getEmailTemplates();
    
    // Find the template to delete
    const template = templates.find(t => t.id === parameters.id);
    
    if (!template) {
      return {
        success: false,
        message: `Email template with ID ${parameters.id} not found`
      };
    }
    
    // If deleting default template, make another one default
    if (template.isDefault && templates.length > 1) {
      const anotherTemplate = templates.find(t => t.id !== parameters.id);
      if (anotherTemplate) {
        anotherTemplate.isDefault = true;
        await saveEmailTemplate(anotherTemplate);
      }
    }
    
    // Delete the template
    await deleteEmailTemplate(parameters.id);
    
    return {
      success: true,
      message: 'Email template deleted successfully'
    };
  } catch (error) {
    logToFile('Error in handleDeleteEmailTemplate:');
    logToFile(error instanceof Error ? error.message : 'Unknown error');
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
} 