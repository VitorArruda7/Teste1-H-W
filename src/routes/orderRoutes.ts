import { Router } from 'express';
import { runPipelineHandler, resetHandler, summaryHandler } from '../controllers/orderController';

const router = Router();

router.post('/run', runPipelineHandler);
router.post('/reset', resetHandler);
router.get('/pedidos', summaryHandler);

export default router;
