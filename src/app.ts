import express from 'express';
import cors from 'cors';
import path from 'path';
import orderRoutes from './routes/orderRoutes';
import { registerLogStreamClient } from './services/logStream';
import { runPipelineHandler, resetHandler, summaryHandler } from './controllers/orderController';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api', orderRoutes);
app.get('/api/logs/stream', registerLogStreamClient);

app.post('/run', runPipelineHandler);
app.post('/reset', resetHandler);
app.get('/pedidos', summaryHandler);

const publicDir = path.join(__dirname, '../public');
app.use(express.static(publicDir));

export default app;

