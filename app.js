import express from 'express';
import confluence from './routes/getconfluenceroutes.js'; // Include file extension
import path from 'path';
import dotenv from "dotenv";
import { fileURLToPath } from 'url';
import cors from 'cors';


dotenv.config();
const app = express();
app.use(cors());
const port = process.env.PORT || 3000;

app.use(confluence);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const options = {
    dotfiles: 'ignore',
    extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'],
    index: false,
    redirect: false,
    setHeaders: (res, filePath, stat) => {
        res.set('x-timestamp', Date.now()); // Optional custom headers
    },
};

// Static files middleware
app.use('/media', express.static(path.join(__dirname, 'media'), options));

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
  