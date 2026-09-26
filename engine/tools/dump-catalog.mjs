// Выгружает каталог деталей (RU и EN) в JSON для генератора спецификации: node tools/dump-catalog.mjs > catalog.json
import { ENGINE, ASSEMBLIES, PARTS } from '../js/catalog.js';
import { ENGINE_EN, ASM_EN, PARTS_EN } from '../js/catalog_en.js';

const pad = n => String(n).padStart(2, '0');
const asms = ASSEMBLIES.map(a => ({
  id: a.id, no: pad(a.no),
  ru: { name: a.name, about: a.about },
  en: { name: ASM_EN[a.id].name, about: ASM_EN[a.id].about },
  parts: a.parts.map((key, i) => ({ key, no: `${a.no}.${pad(i + 1)}`, ru: PARTS[key], en: PARTS_EN[key] })),
}));
process.stdout.write(JSON.stringify({ engine: { ru: ENGINE, en: ENGINE_EN }, asms }, null, 1));
