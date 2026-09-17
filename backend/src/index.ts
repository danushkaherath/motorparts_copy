import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDatabase } from './db/database';
import { authRouter } from './routes/auth';
import { settingsRouter } from './routes/settings';
import { productsRouter } from './routes/products';
import { salesRouter } from './routes/sales';
import { shiftsRouter } from './routes/shifts';
import { purchasesRouter } from './routes/purchases';
import { reportsRouter } from './routes/reports';
import { customersRouter } from './routes/customers';
import { grnRouter } from './routes/grn';
import { printerRouter } from './routes/printer';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Health Check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), system: 'Grocery POS API' });
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/products', productsRouter);
app.use('/api/sales', salesRouter);
app.use('/api/shifts', shiftsRouter);
app.use('/api/purchases', purchasesRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/customers', customersRouter);
app.use('/api/grn', grnRouter);
app.use('/api/print', printerRouter);

// Global Error Handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

// Start Server
async function startServer() {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`🚀 Grocery Store POS Backend running on port ${PORT}`);
      console.log(`📡 Health check available at: http://localhost:${PORT}/api/health`);
    });
  } catch (err) {
    console.error('Fatal: Failed to start POS backend:', err);
    process.exit(1);
  }
}

startServer();
