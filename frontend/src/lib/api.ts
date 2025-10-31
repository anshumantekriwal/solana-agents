// Use proxy in development, Vercel proxy in production
const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development'
const isLocalhost = typeof window !== 'undefined' && (
  window.location.hostname === 'localhost' || 
  window.location.hostname === '127.0.0.1' ||
  window.location.hostname.includes('localhost')
)

const API_BASE_URL = (isDevelopment && isLocalhost)
  ? '/api' // Use Vite proxy in local development
  : '/api/proxy' // Use Vercel serverless proxy in production
const API_KEY = import.meta.env.VITE_API_KEY || 'Commune_dev1'

console.log('API Configuration:', {
  isDevelopment,
  isLocalhost,
  API_BASE_URL,
  mode: import.meta.env.MODE,
  hostname: typeof window !== 'undefined' ? window.location.hostname : 'server'
})

interface DeployAgentRequest {
  agentId: number
  ownerAddress: string
  botType: 'dca' | 'range' | 'custom' | 'twitter'
  swapConfig: any
}

interface DeployAgentResponse {
  success: boolean
  agentUrl?: string
  error?: string
}

interface AgentLogsResponse {
  success: boolean
  logs?: any[]
  error?: string
}

interface AgentStatusResponse {
  success: boolean
  status?: any
  error?: string
}

// Global deployment queue to ensure sequential deployments
class DeploymentQueue {
  private queue: Array<() => Promise<any>> = []
  private isProcessing = false

  async add<T>(deploymentFn: () => Promise<T>): Promise<T> {
    const queuePosition = this.queue.length + 1
    
    if (queuePosition > 1) {
      console.log(`Deployment queued. Position in queue: ${queuePosition}`)
    }
    
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await deploymentFn()
          resolve(result)
        } catch (error) {
          reject(error)
        }
      })
      
      this.processQueue()
    })
  }

  getQueueLength(): number {
    return this.queue.length + (this.isProcessing ? 1 : 0)
  }

  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return
    
    this.isProcessing = true
    
    while (this.queue.length > 0) {
      const deploymentFn = this.queue.shift()!
      try {
        await deploymentFn()
      } catch (error) {
        console.error('Deployment queue error:', error)
        // Continue processing other deployments even if one fails
      }
    }
    
    this.isProcessing = false
  }
}

const deploymentQueue = new DeploymentQueue()

class ApiService {
  private async makeRequest(endpoint: string, options: RequestInit = {}, retries = 3, useTimeout = true, timeoutMs = 10000): Promise<any> {
    // Handle different proxy formats
    let url: string
    if (API_BASE_URL === '/api/proxy') {
      // Vercel proxy format: /api/proxy?path=endpoint
      const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint
      url = `${API_BASE_URL}?path=${encodeURIComponent(cleanEndpoint)}`
    } else {
      // Direct or Vite proxy format
      url = `${API_BASE_URL}${endpoint}`
    }
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        let controller: AbortController | undefined
        let timeoutId: NodeJS.Timeout | undefined
        
        // Only set up timeout if requested
        if (useTimeout) {
          controller = new AbortController()
          timeoutId = setTimeout(() => controller!.abort(), timeoutMs)
        }
        
        const response = await fetch(url, {
          ...options,
          mode: 'cors',
          credentials: 'omit',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': API_KEY || '',
            'Accept': 'application/json',
            ...options.headers,
          },
          signal: controller?.signal,
        })

        if (timeoutId) {
          clearTimeout(timeoutId)
        }

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`API Error (${response.status}): ${errorText}`)
        }

        return response.json()
      } catch (error) {
        console.warn(`API request attempt ${attempt} failed:`, error)
        
        if (attempt === retries) {
          if (error instanceof Error) {
            if (error.name === 'AbortError') {
              throw new Error('Request was cancelled - please check your network connection')
            }
            if (error.message.includes('Failed to fetch') || error.message.includes('Load failed')) {
              throw new Error('Network connection failed - please check if the API server is accessible')
            }
          }
          throw error
        }
        
        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000))
      }
    }
  }

  async deployAgent(request: DeployAgentRequest): Promise<DeployAgentResponse> {
    // For Twitter bots, deploy immediately (no queue)
    if (request.botType === 'twitter') {
      return this.deployAgentDirect(request)
    }
    
    // For other bot types, use the deployment queue to ensure sequential processing
    return deploymentQueue.add(() => this.deployAgentDirect(request))
  }

  private async deployAgentDirect(request: DeployAgentRequest): Promise<DeployAgentResponse> {
    try {
      console.log(`Starting deployment for ${request.botType} bot (Agent ID: ${request.agentId})`)
      
      // For custom bots, the server returns immediately with 202 status and we need to poll
      const result = await this.makeRequest('/deploy-agent', {
        method: 'POST',
        body: JSON.stringify(request),
      }, 1, true, 30000) // 30 second timeout for initial request
      
      // If it's a custom bot, the server returns 202 and we need to poll for completion
      if (request.botType === 'custom' && result.status === 'in_progress') {
        console.log(`Custom bot deployment started, polling for completion...`)
        return await this.pollDeploymentStatus(request.agentId)
      }
      
      console.log(`Deployment completed for Agent ID: ${request.agentId}`)
      
      return {
        success: true,
        agentUrl: result.agentUrl || result.url,
      }
    } catch (error) {
      console.error('Deploy agent error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  private async pollDeploymentStatus(agentId: number): Promise<DeployAgentResponse> {
    const maxAttempts = 60 // Poll for up to 10 minutes (60 * 10 seconds)
    let attempts = 0

    while (attempts < maxAttempts) {
      try {
        const statusResult = await this.makeRequest(`/deploy-status/${agentId}`, {
          method: 'GET',
        }, 1, true, 10000) // 10 second timeout per poll

        console.log(`Deployment status for Agent ${agentId}:`, statusResult.status, statusResult.stage)

        if (statusResult.status === 'completed') {
          return {
            success: true,
            agentUrl: statusResult.agentUrl,
          }
        }

        if (statusResult.status === 'failed') {
          return {
            success: false,
            error: statusResult.error || statusResult.message || 'Deployment failed',
          }
        }

        // Still in progress, wait and poll again
        await new Promise(resolve => setTimeout(resolve, 10000)) // Wait 10 seconds
        attempts++
      } catch (error) {
        console.error(`Error polling deployment status (attempt ${attempts + 1}):`, error)
        attempts++
        await new Promise(resolve => setTimeout(resolve, 5000)) // Wait 5 seconds on error
      }
    }

    return {
      success: false,
      error: 'Deployment timeout - please check the deployment status manually',
    }
  }

  async getDeploymentStatus(agentId: number): Promise<any> {
    try {
      const result = await this.makeRequest(`/deploy-status/${agentId}`)
      return {
        success: true,
        ...result,
      }
    } catch (error) {
      console.error('Get deployment status error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  async getAgentLogs(agentId: number): Promise<AgentLogsResponse> {
    try {
      const result = await this.makeRequest(`/logs/${agentId}`)
      
      return {
        success: true,
        logs: result.logs || result.data || [],
      }
    } catch (error) {
      console.error('Get agent logs error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  async getAgentStatus(agentUrl: string): Promise<AgentStatusResponse> {
    try {
      // Since AWS AppRunner URLs are HTTPS, we can make direct calls without CORS issues
      const statusUrl = `${agentUrl}/status`
      console.log(`Fetching agent status from: ${statusUrl}`)
      
      const response = await fetch(statusUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        mode: 'cors',
        credentials: 'omit',
      })

      if (!response.ok) {
        throw new Error(`Status check failed: ${response.status}`)
      }

      const result = await response.json()
      
      return {
        success: true,
        status: result.data || result,
      }
    } catch (error) {
      console.error('Get agent status error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }


  async getAgentLiveLogs(agentUrl: string): Promise<AgentLogsResponse> {
    try {
      // Since AWS AppRunner URLs are HTTPS, we can make direct calls without CORS issues
      const logsUrl = `${agentUrl}/`
      console.log(`Fetching agent live logs from: ${logsUrl}`)
      
      const response = await fetch(logsUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        mode: 'cors',
        credentials: 'omit',
      })

      if (!response.ok) {
        throw new Error(`Logs fetch failed: ${response.status}`)
      }

      const result = await response.json()
      
      return {
        success: true,
        logs: result.logs || result.data || [],
      }
    } catch (error) {
      console.error('Get agent live logs error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  // Health check for the deployer API
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL}/health`, {
        method: 'GET',
        headers: {
          'x-api-key': API_KEY || '',
        },
      })
      return response.ok
    } catch (error) {
      console.error('Health check failed:', error)
      return false
    }
  }
}

export const apiService = new ApiService()
export type { DeployAgentRequest, DeployAgentResponse, AgentLogsResponse, AgentStatusResponse }
