import express from 'express';
import {createRaffleRouter} from '../../server/raffle/router';
const app=express();
app.disable('x-powered-by');
app.use('/api/raffle',createRaffleRouter());
export default app;
