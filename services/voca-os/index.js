const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3001;
const VOCA_AI_ENGINE_URL = process.env.VOCA_AI_ENGINE_URL || 'http://voca-ai-engine:8008';

// Middleware
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'voca-os',
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Voca OS Service is running',
    version: '1.0.0',
    endpoints: {
      'GET /health': 'Health check',
      'POST /api/v1/agents': 'Create agent',
      'POST /api/v1/messages': 'Process message',
      'DELETE /api/v1/agents/:vendor_id': 'Stop agent'
    }
  });
});

// Create agent endpoint
app.post('/api/v1/agents', async (req, res) => {
  try {
    const { vendor_id, agent_config } = req.body;
    
    console.log(`Creating agent for vendor: ${vendor_id}`);
    
    // TODO: Implement actual agent creation logic
    // This is where you would integrate with ElizaOS or other agent framework
    
    const agent_info = {
      agent_id: vendor_id,
      status: 'created',
      config: agent_config,
      created_at: new Date().toISOString()
    };
    
    // Notify main engine about agent creation
    try {
      await axios.post(`${VOCA_AI_ENGINE_URL}/api/v1/agents/${vendor_id}/status`, {
        service: 'voca-os',
        status: 'created',
        agent_info
      });
    } catch (error) {
      console.error('Failed to notify main engine:', error.message);
    }
    
    res.json({
      success: true,
      agent: agent_info
    });
  } catch (error) {
    console.error('Error creating agent:', error);
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

// Process message endpoint
app.post('/api/v1/messages', async (req, res) => {
  try {
    const { vendor_id, message, platform } = req.body;
    
    console.log(`Processing message for vendor: ${vendor_id} on ${platform}`);
    
    // TODO: Implement actual message processing logic
    // This is where you would call the agent to process the message
    
    const response = {
      vendor_id,
      platform,
      message: message,
      response: `Thank you for your message. I'm the AI agent for vendor ${vendor_id} on ${platform}. How can I help you today?`,
      timestamp: new Date().toISOString()
    };
    
    // Notify main engine about message processing
    try {
      await axios.post(`${VOCA_AI_ENGINE_URL}/api/v1/messages/${vendor_id}/processed`, {
        service: 'voca-os',
        response
      });
    } catch (error) {
      console.error('Failed to notify main engine:', error.message);
    }
    
    res.json(response);
  } catch (error) {
    console.error('Error processing message:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// Stop agent endpoint
app.delete('/api/v1/agents/:vendor_id', async (req, res) => {
  try {
    const { vendor_id } = req.params;
    
    console.log(`Stopping agent for vendor: ${vendor_id}`);
    
    // TODO: Implement actual agent stopping logic
    
    // Notify main engine about agent stopping
    try {
      await axios.post(`${VOCA_AI_ENGINE_URL}/api/v1/agents/${vendor_id}/status`, {
        service: 'voca-os',
        status: 'stopped',
        stopped_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Failed to notify main engine:', error.message);
    }
    
    res.json({ 
      success: true, 
      message: `Agent ${vendor_id} stopped successfully` 
    });
  } catch (error) {
    console.error('Error stopping agent:', error);
    res.status(500).json({ error: 'Failed to stop agent' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Voca OS service running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Main engine URL: ${VOCA_AI_ENGINE_URL}`);
});
