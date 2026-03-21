import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import viewsData from './viewsData.mjs';
import componentsData from './componentsData.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = path.join(__dirname, '../src/strings.json');
const s = JSON.parse(fs.readFileSync(p, 'utf8'));
s.views = viewsData;
s.components = componentsData;
fs.writeFileSync(p, JSON.stringify(s, null, 2));
console.log('Merged views + components into strings.json');
