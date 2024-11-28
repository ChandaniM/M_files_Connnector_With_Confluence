import express from 'express';
import getController from '../controller/confluencecontroller.js'; 
const router = express.Router();

router.get('/', getController.getConfluenceController);

export default router; 
