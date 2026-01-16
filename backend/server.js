// Express server to proxy Lambda API calls and invoke lambda transactions
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS for frontend
app.use(cors());
app.use(express.json());

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend server is running' });
});

/**
 * Proxy endpoint to get Lambda sponsor wallet
 * This prevents CORS issues when calling MetaKeep API from frontend
 */
app.post('/api/lambda/sponsor', async (req, res) => {
  try {
    const response = await fetch('https://api.metakeep.xyz/v2/app/lambda/getSponsor', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'x-api-key': process.env.METAKEEP_API_KEY
      }
    });

    const data = await response.json();
    
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to get sponsor wallet', details: data });
    }

    res.json(data);
  } catch (error) {
    console.error('Error fetching sponsor wallet:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

/**
 * Endpoint to invoke Lambda transaction
 * Uses MetaKeep's Invoke Lambda API with serialized transaction message
 */
app.post('/api/lambda/invoke', async (req, res) => {
  try {
    const { serializedTransactionMessage, description, as } = req.body;

    if (!serializedTransactionMessage) {
      return res.status(400).json({ error: 'Missing serializedTransactionMessage' });
    }

    if (!description || !description.text) {
      return res.status(400).json({ error: 'Missing description.text' });
    }

    if (!as || !as.email) {
      return res.status(400).json({ error: 'Missing as.email' });
    }

    console.log('Invoking Lambda transaction...');
    console.log('Description:', description.text);
    console.log('As user:', as.email);

    // Generate unique idempotency key
    const idempotencyKey = `txn_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Call MetaKeep Invoke Lambda API with as user for consent flow
    const response = await fetch('https://api.metakeep.xyz/v2/app/lambda/invoke', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'x-api-key': process.env.METAKEEP_API_KEY,
        'Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify({
        serializedTransactionMessage: serializedTransactionMessage,
        description: description,
        as: as
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Lambda invocation failed:', data);
      return res.status(response.status).json({ 
        error: 'Failed to invoke lambda', 
        details: data 
      });
    }

    console.log('Lambda invocation response:', data);

    // Return the response (will include consentToken if USER_CONSENT_NEEDED)
    res.json(data);

  } catch (error) {
    console.error('Error invoking lambda:', error);
    res.status(500).json({ 
      error: 'Failed to invoke lambda', 
      message: error.message 
    });
  }
});

/**
 * Endpoint to get MetaKeep transaction status
 */
app.post('/api/lambda/status', async (req, res) => {
  try {
    const { transactionId } = req.body;

    if (!transactionId) {
      return res.status(400).json({ error: 'Missing transactionId' });
    }

    const response = await fetch('https://api.metakeep.xyz/v2/app/transaction/status', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'x-api-key': process.env.METAKEEP_API_KEY
      },
      body: JSON.stringify({ transactionId })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Transaction status fetch failed:', data);
      return res.status(response.status).json({
        error: 'Failed to get transaction status',
        details: data
      });
    }

    res.json(data);
  } catch (error) {
    console.error('Error getting transaction status:', error);
    res.status(500).json({
      error: 'Failed to get transaction status',
      message: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
  console.log(`Using MetaKeep API Key: ${process.env.METAKEEP_API_KEY ? 'Configured' : 'Missing'}`);
});
