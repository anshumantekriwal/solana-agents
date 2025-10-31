import express from 'express';
import { logger, getStatus } from './logger.js';
import { baselineFunction as dcaBaselineFunction } from './baseline-dca.js';
import { baselineFunction as rangeBaselineFunction } from './baseline-range.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Create and start the Express server with configurable trading parameters
 * 
 * @param {number} port - Server port (default: 3000)
 * @param {object} tradingConfig - Trading configuration object
 * @param {string} tradingConfig.ownerAddress - Wallet owner address
 * @param {string} tradingConfig.fromToken - Source token symbol (e.g., 'USDC')
 * @param {string} tradingConfig.toToken - Destination token symbol (e.g., 'SOL')
 * @param {number} tradingConfig.amount - Amount to trade
 * @param {string} botType - Type of bot: 'dca', 'range', or 'custom' (default: 'dca')
 * 
 * DCA Bot specific:
 * @param {object} tradingConfig.scheduleOptions - Schedule configuration
 * @param {string} tradingConfig.scheduleOptions.type - 'interval' or 'times'
 * @param {number|array} tradingConfig.scheduleOptions.value - Interval in ms or array of UTC times
 * @param {boolean} tradingConfig.scheduleOptions.executeImmediately - Execute immediately on start
 * 
 * Range Bot specific:
 * @param {string} tradingConfig.tokenToMonitor - Token symbol to monitor for price conditions
 * @param {number} tradingConfig.tokenToMonitorPrice - Target price threshold
 * @param {boolean} tradingConfig.above - True for above price condition, false for below
 * 
 * Custom Bot specific:
 * @param {string} tradingConfig.prompt - Natural language prompt (for reference only, code should be pre-generated)
 * 
 * @example
 * // Start DCA bot server
 * createServer(3000, {
 *   ownerAddress: "5NGqPDeoEfpxwq8bKHkMaSyLXDeR7YmsxSyMbXA5yKSQ",
 *   fromToken: 'USDC',
 *   toToken: 'SOL',
 *   amount: 0.01,
 *   scheduleOptions: {
 *     type: 'interval',
 *     value: 600000, // 10 minutes
 *     executeImmediately: true
 *   }
 * }, 'dca');
 * 
 * @example
 * // Start Range bot server
 * createServer(3000, {
 *   ownerAddress: "5NGqPDeoEfpxwq8bKHkMaSyLXDeR7YmsxSyMbXA5yKSQ",
 *   fromToken: 'USDC',
 *   toToken: 'SOL',
 *   amount: 0.01,
 *   tokenToMonitor: 'SOL',
 *   tokenToMonitorPrice: 100,
 *   above: true
 * }, 'range');
 */
function createServer(port = 3000, tradingConfig = {}, botType) {
    const app = express();
    
    // Add JSON parsing middleware
    app.use(express.json());

    // Logs endpoint - serves logs as JSON
    app.get('/', (req, res) => {
        res.json({
            status: 'success',
            totalLogs: logger.getLogs().length,
            logs: logger.getLogs(),
            lastUpdated: new Date().toISOString()
        });
    });

    // Status endpoint - serves current system status
    app.get('/status', (req, res) => {
        const currentStatus = getStatus();
        
        // Enhance status with schedule timing information
        if (currentStatus.schedule) {
            if (currentStatus.schedule.type === 'interval') {
                const minutes = Math.floor(currentStatus.schedule.nextExecutionIn / 60000);
                const seconds = Math.floor((currentStatus.schedule.nextExecutionIn % 60000) / 1000);
                currentStatus.schedule.nextExecutionFormatted = `${minutes}m ${seconds}s`;
                currentStatus.schedule.nextExecutionTime = new Date(Date.now() + currentStatus.schedule.nextExecutionIn).toISOString();
            } else if (currentStatus.schedule.type === 'times') {
                currentStatus.schedule.nextExecutionFormatted = new Date(currentStatus.schedule.nextExecution).toISOString().slice(11, 19) + ' UTC';
            }
        }
        
        res.json({
            status: 'success',
            data: currentStatus,
            timestamp: new Date().toISOString()
        });
    });

    // Logs as HTML for browser viewing
    app.get('/html', (req, res) => {
        const logs = logger.getLogs();
        const status = getStatus();
        
        // Helper function to format schedule timing
        const formatScheduleTiming = (schedule) => {
            if (!schedule) return '';
            
            if (schedule.type === 'interval') {
                const minutes = Math.floor(schedule.nextExecutionIn / 60000);
                const seconds = Math.floor((schedule.nextExecutionIn % 60000) / 1000);
                return `Next execution in: ${minutes}m ${seconds}s`;
            } else if (schedule.type === 'times') {
                return `Next execution at: ${new Date(schedule.nextExecution).toISOString().slice(11, 19)} UTC`;
            }
            return '';
        };
        
        const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Solana Agent Logs</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #333; 
            min-height: 100vh;
            line-height: 1.6;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .header { 
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 30px;
            text-align: center; 
            margin-bottom: 30px; 
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
        }
        
        .header h1 { 
            color: #4c51bf; 
            margin: 0 0 15px 0; 
            font-size: 2.5em; 
            font-weight: 700;
        }
        
        .header p { 
            color: #666; 
            margin: 10px 0; 
            font-size: 1.1em;
        }
        
        .btn-group {
            margin-top: 20px;
        }
        
        .refresh-btn { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white; 
            border: none; 
            padding: 12px 24px; 
            margin: 0 8px; 
            cursor: pointer; 
            border-radius: 25px; 
            font-size: 14px;
            font-weight: 600;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
        }
        
        .refresh-btn:hover { 
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
        }
        
        .refresh-btn.danger {
            background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
            box-shadow: 0 4px 15px rgba(255, 107, 107, 0.4);
        }
        
        .refresh-btn.danger:hover {
            box-shadow: 0 6px 20px rgba(255, 107, 107, 0.6);
        }
        
        .card {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 30px;
            margin-bottom: 30px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
        }
        
        .card h2 {
            color: #4c51bf;
            margin-bottom: 20px;
            font-size: 1.8em;
            font-weight: 600;
        }
        
        .status-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }
        
        .status-item {
            background: rgba(255, 255, 255, 0.7);
            padding: 15px;
            border-radius: 12px;
            border-left: 4px solid #667eea;
        }
        
        .status-item strong {
            color: #4c51bf;
            font-weight: 600;
        }
        
        .status-badge {
            display: inline-block;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 0.85em;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .status-idle { background: #e2e8f0; color: #4a5568; }
        .status-waiting_next_execution { background: #bee3f8; color: #2b6cb0; }
        .status-running { background: #fef5e7; color: #c05621; }
        .status-success { background: #c6f6d5; color: #22543d; }
        .status-error { background: #fed7d7; color: #c53030; }
        .status-test_execution_start,
        .status-test_wallet_validation,
        .status-test_balance_check,
        .status-test_token_validation,
        .status-test_swap_preparation,
        .status-test_swap_execution,
        .status-test_execution_success { background: #e6fffa; color: #234e52; }
        
        .next-execution {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 25px;
            border-radius: 15px;
            margin: 20px 0;
            text-align: center;
        }
        
        .next-execution h3 {
            margin-bottom: 15px;
            font-size: 1.4em;
        }
        
        .countdown {
            font-size: 2.2em;
            font-weight: 700;
            margin: 10px 0;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        }
        
        .last-execution {
            background: rgba(255, 255, 255, 0.7);
            padding: 20px;
            border-radius: 15px;
            margin: 20px 0;
            border-left: 5px solid #48bb78;
        }
        
        .last-execution.failed {
            border-left-color: #f56565;
        }
        
        .last-execution h3 {
            color: #4c51bf;
            margin-bottom: 15px;
            font-size: 1.3em;
        }
        
        .execution-details {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-top: 15px;
        }
        
        .detail-item {
            background: rgba(255, 255, 255, 0.8);
            padding: 10px 15px;
            border-radius: 8px;
            font-size: 0.9em;
        }
        
        .detail-item strong {
            color: #4c51bf;
            display: block;
            margin-bottom: 5px;
        }
        
        .logs { 
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 30px;
            max-height: 500px; 
            overflow-y: auto; 
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
        }
        
        .log-entry { 
            margin-bottom: 12px; 
            padding: 12px 16px; 
            border-radius: 10px; 
            font-size: 0.95em;
            border-left: 4px solid #e2e8f0;
            background: rgba(255, 255, 255, 0.7);
        }
        
        .log-entry.info { 
            background: rgba(72, 187, 120, 0.1); 
            border-left-color: #48bb78; 
        }
        
        .log-entry.warn { 
            background: rgba(237, 137, 54, 0.1); 
            border-left-color: #ed8936; 
        }
        
        .log-entry.error { 
            background: rgba(245, 101, 101, 0.1); 
            border-left-color: #f56565; 
        }
        
        .timestamp { 
            color: #718096; 
            font-size: 0.85em; 
            font-weight: 500;
        }
        
        .logs::-webkit-scrollbar {
            width: 8px;
        }
        
        .logs::-webkit-scrollbar-track {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 4px;
        }
        
        .logs::-webkit-scrollbar-thumb {
            background: rgba(102, 126, 234, 0.5);
            border-radius: 4px;
        }
        
        .logs::-webkit-scrollbar-thumb:hover {
            background: rgba(102, 126, 234, 0.7);
        }
        
        @media (max-width: 768px) {
            .container {
                padding: 15px;
            }
            
            .header h1 {
                font-size: 2em;
            }
            
            .status-grid {
                grid-template-columns: 1fr;
            }
            
            .countdown {
                font-size: 1.8em;
            }
        }
    </style>
    <script>
        function refreshPage() {
            location.reload();
        }
        // Auto-refresh every 10 seconds
        setInterval(refreshPage, 10000);
    </script>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🤖 Solana Trading Agent</h1>
            <p>Total logs: ${logs.length} | Last updated: ${new Date().toLocaleString()}</p>
            <div class="btn-group">
                <button class="refresh-btn" onclick="refreshPage()">🔄 Refresh</button>
                <button class="refresh-btn danger" onclick="fetch('/clear', {method: 'POST'}).then(() => location.reload())">🗑️ Clear Logs</button>
            </div>
        </div>
    
        <div class="card">
            <h2>📊 Current Status</h2>
            
            <div class="status-grid">
                <div class="status-item">
                    <strong>Stage:</strong> <span class="status-badge status-${status.stage}">${status.stage.replace(/_/g, ' ')}</span>
                </div>
                <div class="status-item">
                    <strong>Message:</strong> ${status.message}
                </div>
                <div class="status-item">
                    <strong>Last Update:</strong> ${new Date(status.timestamp).toLocaleString()}
                </div>
                <div class="status-item">
                    <strong>Current Time:</strong> ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC
                </div>
            </div>
            
            ${status.details && status.details.scheduleType ? `
                <div class="next-execution">
                    <h3>🕰️ Next Execution</h3>
                    ${status.details.scheduleType === 'interval' ? `
                        <div class="countdown">${Math.floor(status.details.nextExecutionIn / 60000)}m ${Math.floor((status.details.nextExecutionIn % 60000) / 1000)}s</div>
                        <p><strong>Interval:</strong> ${Math.round(status.details.intervalMs/1000)}s | <strong>Execute Immediately:</strong> ${status.details.executeImmediately ? 'Yes' : 'No'}</p>
                        <p><strong>Next Execution:</strong> ${new Date(status.details.nextExecutionTime).toLocaleString()}</p>
                    ` : ''}
                    ${status.details.scheduleType === 'times' ? `
                        <div class="countdown">${status.details.nextExecutionTime ? new Date(status.details.nextExecutionTime).toISOString().slice(11, 19) + ' UTC' : 'Calculating...'}</div>
                        <p><strong>Configured Times:</strong> ${status.details.configuredTimes ? status.details.configuredTimes.map(t => `${t.hour.toString().padStart(2, '0')}:${t.minute.toString().padStart(2, '0')}`).join(', ') : 'N/A'} UTC</p>
                        <p><strong>Next Execution:</strong> ${status.details.nextExecutionTime ? new Date(status.details.nextExecutionTime).toLocaleString() : 'Calculating...'}</p>
                    ` : ''}
                    <p><strong>Schedule ID:</strong> ${status.details.scheduleId}</p>
                </div>
            ` : ''}
            
            ${status.details && status.details.lastExecution ? `
                <div class="last-execution ${status.details.lastExecution.success ? '' : 'failed'}">
                    <h3>📋 Last Execution</h3>
                    <div class="execution-details">
                        <div class="detail-item">
                            <strong>Status</strong>
                            ${status.details.lastExecution.success ? '✅ Success' : '❌ Failed'}
                        </div>
                        <div class="detail-item">
                            <strong>Time</strong>
                            ${new Date(status.details.lastExecution.timestamp).toLocaleString()}
                        </div>
                        <div class="detail-item">
                            <strong>Duration</strong>
                            ${status.details.lastExecution.duration || 'N/A'}
                        </div>
                        ${status.details.lastExecution.error ? `
                            <div class="detail-item">
                                <strong>Error</strong>
                                ${status.details.lastExecution.error}
                            </div>
                        ` : ''}
                        ${status.details.lastExecution.details && status.details.lastExecution.details.signature ? `
                            <div class="detail-item">
                                <strong>Transaction</strong>
                                ${status.details.lastExecution.details.signature.slice(0, 20)}...
                            </div>
                        ` : ''}
                        ${status.details.lastExecution.details && status.details.lastExecution.details.fromToken ? `
                            <div class="detail-item">
                                <strong>Trade</strong>
                                ${status.details.lastExecution.details.fromAmount || 'N/A'} ${status.details.lastExecution.details.fromToken} → ${status.details.lastExecution.details.toAmount || 'N/A'} ${status.details.lastExecution.details.toToken}
                            </div>
                        ` : ''}
                    </div>
                </div>
            ` : ''}
            
        </div>
        
        <div class="logs">
            <h2>📝 Recent Logs</h2>
            ${logs.map(log => `
                <div class="log-entry ${log.level}">
                    <span class="timestamp">[${new Date(log.timestamp).toLocaleString()}]</span>
                    ${log.message}
                </div>
            `).join('')}
        </div>
    </div>
</body>
</html>`;
        res.send(html);
    });

    // Clear logs endpoint
    app.post('/clear', (req, res) => {
        logger.clearLogs();
        res.json({ status: 'success', message: 'Logs cleared' });
    });

    // Withdrawal endpoint with API key protection
    app.post('/withdraw', async (req, res) => {
        try {
            // Check API key authentication
            const apiKey = req.headers['x-api-key'] || req.body.apiKey;
            if (!apiKey || apiKey !== process.env.API_KEY) {
                return res.status(401).json({
                    success: false,
                    error: 'Unauthorized: Invalid or missing API key'
                });
            }

            const { tokenSymbol, destinationAddress, amount } = req.body;

            // Validate required parameters
            if (!tokenSymbol || !destinationAddress || !amount) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required parameters: tokenSymbol, destinationAddress, and amount'
                });
            }

            // Validate amount
            if (typeof amount !== 'number' || amount <= 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Amount must be a positive number'
                });
            }

            // Validate destination address format
            if (typeof destinationAddress !== 'string' || destinationAddress.length < 32) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid destination address format'
                });
            }

            logger.log(`🌐 API Withdrawal request: ${amount} ${tokenSymbol} → ${destinationAddress.slice(0, 8)}...${destinationAddress.slice(-8)}`);

            // Import transfer function and execute withdrawal
            const { transfer } = await import('./trading.js');
            const { getOrCreateWallet } = await import('./wallet.js');
            
            // Get wallet for the configured owner
            const wallet = await getOrCreateWallet(config.ownerAddress);
            
            const result = await transfer(
                wallet.walletId,
                wallet.walletAddress,
                destinationAddress,
                tokenSymbol,
                amount
            );

            // Log the result
            if (result.success) {
                logger.log(`✅ API Withdrawal completed: ${result.signature}`);
            } else {
                logger.error(`❌ API Withdrawal failed: ${result.error}`);
            }

            // Return result
            res.json(result);

        } catch (error) {
            const errorMsg = `API Withdrawal error: ${error.message}`;
            logger.error(`❌ ${errorMsg}`);
            res.status(500).json({
                success: false,
                error: errorMsg
            });
        }
    });

    // Health check
    app.get('/health', (req, res) => {
        res.json({ 
            status: 'healthy', 
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        });
    });

    const server = app.listen(port, async () => {
        console.log(`📡 Server running at http://localhost:${port}`);
        console.log(`📊 View dashboard: http://localhost:${port}/html`);
        console.log(`📝 Logs API: http://localhost:${port}/`);
        console.log(`📈 Status API: http://localhost:${port}/status`);
        console.log(`💸 Withdrawal API: POST http://localhost:${port}/withdraw (requires API_KEY)`);
        
        // Auto-start baseline execution
        console.log(`🚀 Starting ${botType.toUpperCase()} bot execution...`);
        try {
            await startBaselineExecution(tradingConfig, botType);
        } catch (error) {
            console.error(`❌ Failed to start baseline execution:`, error);
        }
    });

    return server;
}

// Auto-start baseline execution function
async function startBaselineExecution(config = {}, botType = 'dca') {
    // Trading configuration (can be passed as input or use defaults)
    const ownerAddress = config.ownerAddress || "5NGqPDeoEfpxwq8bKHkMaSyLXDeR7YmsxSyMbXA5yKSQ";
    const fromToken = config.fromToken || 'USDC';
    const toToken = config.toToken || 'SOL';
    const amount = config.amount || 0.01;
    
    console.log(`🎯 Trading Config: ${amount} ${fromToken} → ${toToken}`);
    console.log(`🤖 Bot Type: ${botType.toUpperCase()}`);
    
    let result;
    
    if (botType === 'dca') {
        // DCA Bot execution
        const scheduleOptions = config.scheduleOptions || {
            executeImmediately: true,
            type: 'interval',
            value: 600000, // 10 minutes in milliseconds
        };
        
        console.log(`🕰️ Schedule: ${scheduleOptions.type} - ${scheduleOptions.value}`);
        result = await dcaBaselineFunction(ownerAddress, fromToken, toToken, amount, scheduleOptions);
        
    } else if (botType === 'range') {
        // Range Bot execution
        const tokenToMonitor = config.tokenToMonitor || 'SOL';
        const tokenToMonitorPrice = config.tokenToMonitorPrice || 100;
        const above = config.above !== undefined ? config.above : true;
        
        console.log(`📊 Price Monitoring: ${tokenToMonitor} ${above ? 'above' : 'below'} $${tokenToMonitorPrice}`);
        result = await rangeBaselineFunction(ownerAddress, fromToken, toToken, amount, tokenToMonitor, tokenToMonitorPrice, above);
        
    } else if (botType === 'custom') {
        // Custom Bot execution - use pre-generated function from baseline.js
        const prompt = config.prompt;
        
        if (!prompt) {
            throw new Error('Custom bot requires a prompt in the configuration');
        }
        
        console.log(`🤖 Custom Bot Prompt: ${prompt}`);
        console.log(`🚀 Executing custom baseline function...`);
        
        // Import the generated function from baseline.js (should be pre-generated by deployer)
        try {
            const { baselineFunction: customBaselineFunction } = await import('./baseline.js');
            
            if (!customBaselineFunction) {
                throw new Error('No baselineFunction found in baseline.js. Make sure the deployer generated the code properly.');
            }
            
            // Execute with hardcoded owner address and minimal config
            result = await customBaselineFunction(ownerAddress, {});
            
        } catch (importError) {
            throw new Error(`Failed to import custom baseline function: ${importError.message}`);
        }
        
    } else {
        throw new Error(`Unsupported bot type: ${botType}`);
    }
    
    if (result.success) {
        console.log(`✅ Baseline execution started successfully`);
        if (result.scheduleId) {
            console.log(`📝 Schedule ID: ${result.scheduleId}`);
        }
    } else {
        console.error(`❌ Baseline execution failed:`, result.error);
    }
    
    return result;
}

// Main entry point - start server and baseline execution
const SERVER_PORT = process.env.SERVER_PORT || 3000;

// Example: Start server with custom trading configuration
// You can modify these values or pass them as parameters
// const dcaTradingConfig = {
//     ownerAddress: "5NGqPDeoEfpxwq8bKHkMaSyLXDeR7YmsxSyMbXA5yKSQ",
//     fromToken: 'USDC',
//     toToken: 'SOL', 
//     amount: 0.001,
//     scheduleOptions: {
//         executeImmediately: false,
//         type: 'interval',
//         value: 300000, // 5 minutes in milliseconds
//         // Alternative time-based schedule:
//         // type: 'times',
//         // value: ['09:30', '15:30'], // UTC times
//     }
// };

// const rangeTradingConfig = {
//     ownerAddress: "5NGqPDeoEfpxwq8bKHkMaSyLXDeR7YmsxSyMbXA5yKSQ",
//     fromToken: 'USDC',
//     toToken: 'SOL', 
//     amount: 0.001,
//     tokenToMonitor: 'SOL',
//     tokenToMonitorPrice: 100,
//     above: true
// };

// const customTradingConfig = {
//     prompt: "Buy 0.1 SOL with USDC every hour if Bitcoin is above $50000",
//     history: [] // Optional conversation history
// };

// createServer(SERVER_PORT, dcaTradingConfig, 'dca');
// createServer(SERVER_PORT, rangeTradingConfig, 'range');
// createServer(SERVER_PORT, customTradingConfig, 'custom');

export { createServer };
