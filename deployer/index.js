require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const deployAgent = require("./deploy");
const { getAgentLogs } = require("./logs");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// API Key Auth Middleware
const API_KEY = process.env.API_KEY || "Commune_dev1";
app.use((req, res, next) => {
  const apiKey = req.headers["x-api-key"];
  console.log(
    `🔐 [AUTH] ${req.method} ${req.path} - API Key provided: ${
      apiKey ? "Yes" : "No"
    }`
  );
  if (!apiKey || apiKey !== API_KEY) {
    console.log(`❌ [AUTH] ${req.method} ${req.path} - Authentication failed`);
    return res
      .status(401)
      .json({ error: "Unauthorized: Invalid or missing API key." });
  }
  console.log(
    `✅ [AUTH] ${req.method} ${req.path} - Authentication successful`
  );
  next();
});

// In-memory deployment status tracking (in production, use Redis or database)
const deploymentStatus = new Map();

// Deploy Solana Agent (Async Pattern)
app.post("/deploy-agent", async (req, res) => {
  const { agentId, ownerAddress, botType = 'dca', swapConfig } = req.body;

  console.log(`🚀 [DEPLOY] Starting deployment for Solana agent: ${agentId}`);
  console.log(`📋 [DEPLOY] Agent details:`, {
    agentId,
    botType,
    hasOwnerAddress: !!ownerAddress,
    hasSwapConfig: !!swapConfig,
  });

  // Validate botType
  if (!['dca', 'range', 'twitter', 'custom'].includes(botType)) {
    console.log(`❌ [DEPLOY] Invalid bot type: ${botType}`);
    return res.status(400).json({
      success: false,
      error: "Invalid bot type. Must be 'dca', 'range', 'twitter', or 'custom'.",
      validTypes: ['dca', 'range', 'twitter', 'custom']
    });
  }

  // For custom bots with AI code generation, use async pattern to avoid timeouts
  if (botType === 'custom') {
    // Set initial status
    deploymentStatus.set(agentId, {
      status: 'in_progress',
      stage: 'initializing',
      message: 'Starting deployment process...',
      startTime: new Date().toISOString()
    });

    // Start deployment in background
    deployAgentAsync(agentId, ownerAddress, botType, swapConfig);

    // Return immediately with job ID
    return res.status(202).json({
      success: true,
      agentId,
      status: 'in_progress',
      message: 'Deployment started. Use /deploy-status/:agentId to check progress.',
      pollUrl: `/deploy-status/${agentId}`
    });
  }

  // For other bot types, deploy synchronously (they're faster)
  try {
    const agentUrl = await deployAgent({
      agentId,
      ownerAddress,
      botType,
      swapConfig,
    });
    console.log(
      `✅ [DEPLOY] Successfully deployed Solana agent ${agentId} to: ${agentUrl}`
    );
    res.status(200).json({ 
      success: true,
      agentUrl,
      agentId,
      message: "Solana agent deployed successfully"
    });
  } catch (err) {
    console.error(`❌ [DEPLOY] Failed to deploy Solana agent ${agentId}:`, err);
    res.status(500).json({ 
      success: false,
      error: "Failed to deploy agent.",
      details: err.message 
    });
  }
});

// Async deployment function
async function deployAgentAsync(agentId, ownerAddress, botType, swapConfig) {
  try {
    // Update status: AI Code Generation
    deploymentStatus.set(agentId, {
      status: 'in_progress',
      stage: 'code_generation',
      message: 'Generating AI code...',
      startTime: deploymentStatus.get(agentId).startTime
    });

    const agentUrl = await deployAgent({
      agentId,
      ownerAddress,
      botType,
      swapConfig,
    });

    // Update status: Success
    deploymentStatus.set(agentId, {
      status: 'completed',
      stage: 'deployed',
      message: 'Deployment completed successfully',
      agentUrl,
      startTime: deploymentStatus.get(agentId).startTime,
      completedTime: new Date().toISOString()
    });

    console.log(`✅ [DEPLOY] Successfully deployed Solana agent ${agentId} to: ${agentUrl}`);
  } catch (err) {
    // Update status: Error
    deploymentStatus.set(agentId, {
      status: 'failed',
      stage: 'error',
      message: err.message,
      error: err.message,
      startTime: deploymentStatus.get(agentId).startTime,
      failedTime: new Date().toISOString()
    });

    console.error(`❌ [DEPLOY] Failed to deploy Solana agent ${agentId}:`, err);
  }
}

// Check deployment status
app.get("/deploy-status/:agentId", (req, res) => {
  const { agentId } = req.params;
  const status = deploymentStatus.get(parseInt(agentId));

  if (!status) {
    return res.status(404).json({
      success: false,
      error: "Deployment not found",
      agentId
    });
  }

  res.status(200).json({
    success: true,
    agentId,
    ...status
  });
});

// Get Agent Logs
app.get("/logs/:agentId", async (req, res) => {
  const { agentId } = req.params;
  const { lines = 500 } = req.query;

  console.log(`📊 [LOGS] Fetching logs for agent: ${agentId}`);
  console.log(`📋 [LOGS] Requested lines: ${lines}`);

  try {
    const logs = await getAgentLogs(agentId, parseInt(lines));

    console.log(
      `✅ [LOGS] Successfully retrieved ${logs.totalEvents} log events for agent ${agentId}`
    );
    console.log(`📊 [LOGS] Log group: ${logs.logGroupName}`);

    res.status(200).json({ 
      success: true,
      logs,
      agentId 
    });
  } catch (err) {
    console.error(
      `❌ [LOGS] Failed to retrieve logs for agent ${agentId}:`,
      err
    );
    res.status(500).json({ 
      success: false,
      error: "Failed to retrieve agent logs.",
      details: err.message 
    });
  }
});

// List deployed agents
app.get("/agents", async (req, res) => {
  console.log(`📋 [AGENTS] Listing deployed agents`);
  
  try {
    // This would typically query a database or AWS to list deployed agents
    // For now, return a placeholder response
    res.status(200).json({
      success: true,
      message: "Agent listing not yet implemented",
      agents: []
    });
  } catch (err) {
    console.error(`❌ [AGENTS] Failed to list agents:`, err);
    res.status(500).json({ 
      success: false,
      error: "Failed to list agents.",
      details: err.message 
    });
  }
});

// Health check
app.get("/", (req, res) => {
  console.log(`🏠 [HEALTH] Health check request received`);
  res.json({
    success: true,
    message: "Solana Agent Deployer is live",
    timestamp: new Date().toISOString(),
    version: "1.0.0"
  });
});

// Get deployment status
app.get("/status/:agentId", async (req, res) => {
  const { agentId } = req.params;
  
  console.log(`📊 [STATUS] Checking status for agent: ${agentId}`);
  
  try {
    // This would check the actual deployment status
    res.status(200).json({
      success: true,
      agentId,
      status: "running", // placeholder
      message: "Status check not yet fully implemented"
    });
  } catch (err) {
    console.error(`❌ [STATUS] Failed to check status for agent ${agentId}:`, err);
    res.status(500).json({ 
      success: false,
      error: "Failed to check agent status.",
      details: err.message 
    });
  }
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 [SERVER] Solana Agent Deployer running on port ${PORT}`);
  console.log(`🔐 [SERVER] API Key authentication enabled`);
  console.log(`📡 [SERVER] Endpoints available:`);
  console.log(`   POST /deploy-agent - Deploy a new Solana agent`);
  console.log(`   GET  /logs/:agentId - Get agent logs`);
  console.log(`   GET  /status/:agentId - Check agent status`);
  console.log(`   GET  /agents - List deployed agents`);
  console.log(`   GET  / - Health check`);
});
