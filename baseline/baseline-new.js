import dotenv from "dotenv";
import { createClient } from '@supabase/supabase-js';
import { getOrCreateWallet } from './wallet.js';
import { logger, updateStatus } from './logger.js';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase URL and key must be set in environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Helper function to write environment variables to .env file
 */
function writeToEnvFile(key, value) {
    try {
        const envPath = path.resolve('.env');
        let envContent = '';
        
        // Read existing .env file if it exists
        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf8');
        }
        
        // Split into lines
        const lines = envContent.split('\n');
        let keyFound = false;
        
        // Update existing key or add new one
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith(`${key}=`)) {
                lines[i] = `${key}=${value}`;
                keyFound = true;
                break;
            }
        }
        
        // If key not found, add it
        if (!keyFound) {
            lines.push(`${key}=${value}`);
        }
        
        // Write back to file
        fs.writeFileSync(envPath, lines.join('\n'));
        logger.log(`📝 Updated .env file: ${key}=${value}`);
        
    } catch (error) {
        logger.error(`❌ Failed to write to .env file: ${error.message}`);
    }
}

/**
 * Baseline trading class with improved architecture
 */
class Baseline {
    constructor(ownerAddress, agentId) {
        if (!ownerAddress) {
            throw new Error('Owner address is required');
        }
        if (!agentId) {
            throw new Error('Agent ID is required');
        }
        
        this.ownerAddress = ownerAddress;
        this.agentId = agentId;
        this.wallet = null;
        this.walletId = null;
        this.walletAddress = null;
        this.initialized = false;
        
        // Check if wallet info already exists in environment
        const existingWalletId = process.env.WALLET_ID;
        const existingWalletAddress = process.env.WALLET_ADDRESS;
        
        if (existingWalletId && existingWalletAddress) {
            logger.log(`🔍 Found existing wallet info in environment: ${existingWalletId}`);
            this.walletId = existingWalletId;
            this.walletAddress = existingWalletAddress;
        }
    }
    
    /**
     * Initialize the baseline instance by creating/loading wallet
     */
    async initialize() {
        try {
            updateStatus('wallet_init', 'Initializing wallet...', null, { 
                ownerAddress: this.ownerAddress,
                agentId: this.agentId
            });
            
            logger.log(`🔧 Initializing baseline for owner: ${this.ownerAddress}, agent: ${this.agentId}`);
            
            // Create or get existing wallet (only if not already loaded from env)
            if (!this.walletId || !this.walletAddress) {
                this.wallet = await getOrCreateWallet(this.ownerAddress);
                
                // Store wallet information securely
                this.walletId = this.wallet.walletId;
                this.walletAddress = this.wallet.walletAddress;
            } else {
                logger.log(`📋 Using existing wallet info from environment`);
                // Still need to get the full wallet object for trading operations
                this.wallet = await getOrCreateWallet(this.ownerAddress);
            }
            
            // Store wallet ID in environment variable for persistence
            process.env.WALLET_ID = this.walletId;
            process.env.WALLET_ADDRESS = this.walletAddress;
            
            // Also write to .env file for persistence across restarts
            writeToEnvFile('WALLET_ID', this.walletId);
            writeToEnvFile('WALLET_ADDRESS', this.walletAddress);
            
            logger.log(`💾 Stored wallet info in environment and .env file: WALLET_ID=${this.walletId}`);
            
            // Mark as initialized
            this.initialized = true;
            
            // Create status object as JSON string
            const status = {
                stage: 'wallet_initialized',
                message: 'Wallet initialized successfully',
                timestamp: new Date().toISOString(),
                success: true,
                details: {
                    ownerAddress: this.ownerAddress,
                    walletAddress: this.walletAddress,
                    walletId: this.walletId
                }
            };
            
            // Update Supabase with wallet address and status
            logger.log(`📝 Updating agent ${this.agentId} in database...`);
            logger.log(`📝 Supabase URL: ${supabaseUrl ? 'Set' : 'Not set'}`);
            logger.log(`📝 Supabase Key: ${supabaseKey ? 'Set' : 'Not set'}`);
            
            // First check if the agent exists
            const { data: existingAgent, error: checkError } = await supabase
                .from('solana_agents')
                .select('id, agent_name')
                .eq('id', this.agentId)
                .single();
            
            if (checkError) {
                logger.error(`❌ Error checking agent existence:`, checkError);
                throw new Error(`Agent lookup failed: ${checkError.message || JSON.stringify(checkError)}`);
            }
            
            if (!existingAgent) {
                throw new Error(`Agent with ID ${this.agentId} not found in database`);
            }
            
            logger.log(`✅ Found agent: ${existingAgent.agent_name} (ID: ${existingAgent.id})`);
            
            const { data, error: supabaseError } = await supabase
                .from('solana_agents')
                .update({
                    agent_wallet: this.walletAddress,
                    status: JSON.stringify(status),
                    updated_at: new Date().toISOString()
                })
                .eq('id', this.agentId);
            
            if (supabaseError) {
                logger.error(`❌ Failed to update database:`, supabaseError);
                throw new Error(`Database update failed: ${supabaseError.message || JSON.stringify(supabaseError)}`);
            }
            
            logger.log(`📝 Database update result:`, { data, agentId: this.agentId });
            
            updateStatus('wallet_ready', 'Wallet initialized successfully', true, {
                ownerAddress: this.ownerAddress,
                agentId: this.agentId,
                walletAddress: this.walletAddress,
                walletId: this.walletId
            });
            
            logger.log(`✅ Wallet ready: ${this.walletAddress}`);
            logger.log(`✅ Database updated for agent ${this.agentId}`);
            
            return {
                success: true,
                walletAddress: this.walletAddress,
                walletId: this.walletId,
                agentId: this.agentId
            };
            
        } catch (error) {
            const errorStatus = {
                stage: 'wallet_error',
                message: `Wallet initialization failed: ${error.message}`,
                timestamp: new Date().toISOString(),
                success: false,
                details: {
                    ownerAddress: this.ownerAddress,
                    error: error.message
                }
            };
            
            // Try to update database with error status
            try {
                const { error: dbUpdateError } = await supabase
                    .from('solana_agents')
                    .update({
                        status: JSON.stringify(errorStatus),
                        error_message: error.message,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', this.agentId);
                    
                if (dbUpdateError) {
                    logger.error(`❌ Failed to update error status in database:`, dbUpdateError);
                }
            } catch (dbError) {
                logger.error(`❌ Exception updating error status in database:`, dbError);
            }
            
            updateStatus('wallet_error', `Wallet initialization failed: ${error.message}`, false, {
                ownerAddress: this.ownerAddress,
                agentId: this.agentId,
                error: error.message
            });
            
            logger.error(`❌ Wallet initialization failed: ${error.message}`);
            
            throw error;
        }
    }
    
    /**
     * Check if the baseline instance is properly initialized
     */
    isInitialized() {
        return this.initialized && this.wallet && this.walletId && this.walletAddress;
    }
    
    /**
     * Get wallet information (read-only)
     */
    getWalletInfo() {
        if (!this.isInitialized()) {
            throw new Error('Baseline not initialized. Call initialize() first.');
        }
        
        return {
            walletId: this.walletId,
            walletAddress: this.walletAddress,
            ownerAddress: this.ownerAddress,
            agentId: this.agentId
        };
    }
    
    /**
     * Clear wallet information from environment variables and .env file
     */
    clearWalletFromEnv() {
        delete process.env.WALLET_ID;
        delete process.env.WALLET_ADDRESS;
        
        // Also remove from .env file
        this.removeFromEnvFile('WALLET_ID');
        this.removeFromEnvFile('WALLET_ADDRESS');
        
        logger.log(`🗑️  Cleared wallet info from environment and .env file`);
    }
    
    /**
     * Helper method to remove a key from .env file
     */
    removeFromEnvFile(key) {
        try {
            const envPath = path.resolve('.env');
            
            if (!fs.existsSync(envPath)) {
                return;
            }
            
            const envContent = fs.readFileSync(envPath, 'utf8');
            const lines = envContent.split('\n');
            
            // Filter out the key we want to remove
            const filteredLines = lines.filter(line => !line.startsWith(`${key}=`));
            
            // Write back to file
            fs.writeFileSync(envPath, filteredLines.join('\n'));
            logger.log(`📝 Removed ${key} from .env file`);
            
        } catch (error) {
            logger.error(`❌ Failed to remove ${key} from .env file: ${error.message}`);
        }
    }
    
    /**
     * Get wallet info from environment variables (static method)
     */
    static getWalletFromEnv() {
        const walletId = process.env.WALLET_ID;
        const walletAddress = process.env.WALLET_ADDRESS;
        
        if (walletId && walletAddress) {
            return { walletId, walletAddress };
        }
        
        return null;
    }
}

export { Baseline };
const baseline = new Baseline("5NGqPDeoEfpxwq8bKHkMaSyLXDeR7YmsxSyMbXA5yKSQ", 14);

// Initialize - this will create wallet AND update database
await baseline.initialize();

// Get info including agent ID
const info = baseline.getWalletInfo();
console.log(info.agentId); // 123

const walletInfo = Baseline.getWalletFromEnv();
console.log(walletInfo);