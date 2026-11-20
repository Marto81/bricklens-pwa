/**
 * Base local compacta de precios de referencia en EUR (€) y años de lanzamiento
 * para minifiguras populares (BrickLink / Brickset).
 * Permite mostrar precios acordes incluso sin conexión o en hosting estático sin proxy.
 * Formato compacto: [usedEur, newEur, yearReleased, theme?, appearsInSets?]
 */
export type SeedPriceTuple = readonly [
  usedEur: number,
  newEur: number,
  yearReleased: number,
  theme?: string,
  appearsInSets?: number
];

export const MINIFIG_PRICE_SEEDS: Record<string, SeedPriceTuple> = {
  // === Star Wars (Mandalorian, Clone Wars, OT, Prequels, Sequels) ===
  sw0001a: [4.2, 7.8, 1999, 'Star Wars', 4],
  sw0001b: [3.4, 6.2, 2007, 'Star Wars', 12],
  sw0002: [39.5, 108.0, 2000, 'Star Wars', 3],
  sw0004: [12.5, 22.0, 1999, 'Star Wars', 3],
  sw0010: [3.2, 6.5, 1999, 'Star Wars', 5],
  sw0011: [4.5, 8.9, 1999, 'Star Wars', 4],
  sw0021: [16.5, 29.0, 2000, 'Star Wars', 2],
  sw0053: [195.0, 310.0, 2002, 'Star Wars', 1],
  sw0091: [4.3, 6.9, 2004, 'Star Wars', 2],
  sw0107: [1450.0, 1920.0, 2003, 'Star Wars', 1],
  sw0117: [7.8, 13.5, 2005, 'Star Wars', 3],
  sw0126: [4.8, 9.2, 2005, 'Star Wars', 6],
  sw0158: [8.4, 14.2, 2007, 'Star Wars', 2],
  sw0161: [9.2, 16.5, 2007, 'Star Wars', 2],
  sw0188: [4.2, 7.5, 2008, 'Star Wars', 14],
  sw0192: [28.0, 46.0, 2008, 'Star Wars', 3],
  sw0196: [21.5, 36.0, 2008, 'Star Wars', 1],
  sw0201: [4.9, 8.4, 2008, 'Star Wars', 9],
  sw0221: [7.5, 12.8, 2009, 'Star Wars', 4],
  sw0223: [8.9, 15.0, 2009, 'Star Wars', 2],
  sw0275: [22.0, 38.0, 2010, 'Star Wars', 2],
  sw0279: [18.5, 32.0, 2010, 'Star Wars', 1],
  sw0314: [31.0, 52.0, 2011, 'Star Wars', 1],
  sw0330: [19.0, 34.0, 2011, 'Star Wars', 1],
  sw0337: [9.3, 14.5, 2011, 'Star Wars', 2],
  sw0366: [4.6, 8.2, 2012, 'Star Wars', 3],
  sw0377: [27.0, 44.0, 2012, 'Star Wars', 1],
  sw0383: [10.7, 16.2, 2012, 'Star Wars', 2],
  sw0416: [24.0, 41.0, 2012, 'Star Wars', 2],
  sw0442: [26.5, 45.0, 2013, 'Star Wars', 1],
  sw0445: [7.4, 12.8, 2013, 'Star Wars', 2],
  sw0450: [63.9, 93.5, 2013, 'Star Wars', 1],
  sw0454: [3.9, 7.1, 2013, 'Star Wars', 3],
  sw0485: [14.5, 24.0, 2013, 'Star Wars', 1],
  sw0518: [5.4, 9.5, 2014, 'Star Wars', 2],
  sw0522: [9.5, 14.8, 2014, 'Star Wars', 2],
  sw0527: [6.8, 11.4, 2014, 'Star Wars', 4],
  sw0539: [18.2, 29.0, 2014, 'Star Wars', 2],
  sw0547: [26.0, 42.0, 2014, 'Star Wars', 1],
  sw0574: [38.0, 64.0, 2014, 'Star Wars', 1],
  sw0585: [5.5, 10.6, 2014, 'Star Wars', 11],
  sw0614: [5.5, 8.9, 2015, 'Star Wars', 2],
  sw0617: [4.4, 7.6, 2015, 'Star Wars', 3],
  sw0621: [4.1, 7.2, 2015, 'Star Wars', 2],
  sw0631: [34.6, 49.5, 2015, 'Star Wars', 1],
  sw0634: [5.9, 9.8, 2015, 'Star Wars', 3],
  sw0651: [4.2, 7.4, 2015, 'Star Wars', 5],
  sw0654: [3.6, 6.1, 2015, 'Star Wars', 6],
  sw0671: [3.8, 6.8, 2015, 'Star Wars', 4],
  sw0718: [7.2, 8.9, 2016, 'Star Wars', 2],
  sw0719: [14.2, 16.5, 2016, 'Star Wars', 1],
  sw0745: [72.0, 108.0, 2016, 'Star Wars', 1],
  sw0752: [14.4, 20.5, 2016, 'Star Wars', 1],
  sw0759: [31.5, 48.0, 2016, 'Star Wars', 1],
  sw0781: [41.4, 59.0, 2016, 'Star Wars', 1],
  sw0795: [17.6, 25.0, 2016, 'Star Wars', 3],
  sw0806: [8.4, 13.5, 2017, 'Star Wars', 2],
  sw0811: [86.0, 132.0, 2017, 'Star Wars', 1],
  sw0833: [9.3, 13.8, 2017, 'Star Wars', 2],
  sw0851: [2.2, 3.6, 2017, 'Star Wars', 1],
  sw0880: [12.5, 19.8, 2018, 'Star Wars', 1],
  sw0904: [32.2, 46.0, 2018, 'Star Wars', 1],
  sw0923: [24.5, 35.0, 2018, 'Star Wars', 1],
  sw0997: [4.8, 7.9, 2019, 'Star Wars', 8],
  sw0997a: [4.6, 7.5, 2019, 'Star Wars', 4],
  sw0997b: [4.9, 8.1, 2019, 'Star Wars', 5],
  sw1035: [5.4, 8.5, 2019, 'Star Wars', 4],
  sw1057: [6.8, 10.4, 2019, 'Star Wars', 3],
  sw1093: [4.6, 7.2, 2020, 'Star Wars', 6],
  sw1094: [5.1, 7.9, 2020, 'Star Wars', 4],
  sw1135: [6.9, 10.2, 2021, 'Star Wars', 3],
  sw1146: [7.8, 11.9, 2021, 'Star Wars', 2],
  sw1159: [31.0, 44.0, 2021, 'Star Wars', 1],
  sw1171: [17.9, 21.9, 2021, 'Star Wars', 1],
  sw1172: [12.4, 16.8, 2021, 'Star Wars', 1],
  sw1178: [16.5, 23.5, 2021, 'Star Wars', 1],
  sw1214: [4.9, 7.4, 2022, 'Star Wars', 3],
  sw1224: [8.5, 12.2, 2022, 'Star Wars', 2],
  sw1235: [5.8, 8.6, 2022, 'Star Wars', 2],
  sw1248: [14.8, 20.4, 2022, 'Star Wars', 1],
  sw1260: [4.5, 6.8, 2023, 'Star Wars', 4],
  sw1315: [7.4, 8.2, 2023, 'Star Wars', 2],
  sw1316: [22.0, 29.5, 2023, 'Star Wars', 1],
  sw1329: [8.9, 12.6, 2024, 'Star Wars', 2],
  sw1341: [42.0, 56.0, 2024, 'Star Wars', 1],

  // === Marvel & DC Super Heroes ===
  sh0001: [18.5, 29.0, 2012, 'Marvel / DC Super Heroes', 1],
  sh0015: [5.2, 8.9, 2012, 'Marvel / DC Super Heroes', 5],
  sh0036: [6.4, 10.8, 2012, 'Marvel / DC Super Heroes', 3],
  sh0065: [14.2, 23.0, 2013, 'Marvel / DC Super Heroes', 1],
  sh0084: [12.8, 21.5, 2013, 'Marvel / DC Super Heroes', 1],
  sh0125: [9.4, 15.2, 2014, 'Marvel / DC Super Heroes', 2],
  sh0165: [7.9, 13.4, 2015, 'Marvel / DC Super Heroes', 2],
  sh0180: [19.2, 31.0, 2015, 'Marvel / DC Super Heroes', 1],
  sh0232: [54.0, 78.5, 2016, 'Marvel Super Heroes', 1],
  sh0254: [11.6, 18.4, 2016, 'Marvel / DC Super Heroes', 2],
  sh0368: [6.8, 10.9, 2017, 'Marvel / DC Super Heroes', 2],
  sh0412: [16.4, 25.0, 2017, 'Marvel / DC Super Heroes', 1],
  sh0498: [9.2, 14.5, 2018, 'Marvel / DC Super Heroes', 2],
  sh0505: [14.0, 21.5, 2018, 'Marvel / DC Super Heroes', 1],
  sh0558: [5.6, 8.8, 2019, 'Marvel / DC Super Heroes', 3],
  sh0612: [7.4, 11.2, 2020, 'Marvel / DC Super Heroes', 2],
  sh0682: [4.8, 7.6, 2021, 'Marvel / DC Super Heroes', 3],
  sh0742: [24.5, 34.0, 2021, 'Marvel / DC Super Heroes', 1],
  sh0821: [8.1, 11.9, 2022, 'Marvel / DC Super Heroes', 2],
  sh0895: [11.4, 15.8, 2023, 'Marvel / DC Super Heroes', 1],

  // === Harry Potter ===
  hp0001: [4.5, 8.2, 2001, 'Harry Potter', 6],
  hp0089: [11.5, 19.0, 2010, 'Harry Potter', 2],
  hp0128: [3.8, 6.2, 2018, 'Harry Potter', 5],
  hp0150: [4.2, 6.8, 2018, 'Harry Potter', 4],
  hp0175: [8.6, 13.5, 2019, 'Harry Potter', 2],
  hp0210: [5.4, 8.4, 2020, 'Harry Potter', 3],
  hp0295: [12.4, 18.2, 2021, 'Harry Potter', 1],
  hp0348: [16.8, 24.0, 2022, 'Harry Potter', 1],
  hp0410: [7.2, 10.6, 2023, 'Harry Potter', 2],

  // === Ninjago ===
  njo0001: [4.2, 7.9, 2011, 'Ninjago', 4],
  njo0031: [6.5, 11.2, 2012, 'Ninjago', 3],
  njo0070: [19.8, 29.5, 2013, 'Ninjago', 2],
  njo0114: [14.5, 23.0, 2014, 'Ninjago', 1],
  njo0164: [18.2, 28.0, 2015, 'Ninjago', 1],
  njo0299: [9.4, 14.8, 2017, 'Ninjago', 2],
  njo0492: [6.8, 10.5, 2019, 'Ninjago', 2],
  njo0695: [5.9, 8.9, 2021, 'Ninjago', 2],
  njo0812: [11.2, 15.8, 2023, 'Ninjago', 1],

  // === Classic Space / Castle / LOTR / Pirates ===
  sp0002: [24.0, 62.0, 1984, 'Classic Space', 9],
  sp0004: [12.5, 34.0, 1979, 'Classic Space', 14],
  sp0005: [15.0, 39.0, 1979, 'Classic Space', 11],
  sp0007: [29.0, 74.0, 1984, 'Classic Space', 6],
  sp0060: [48.0, 95.0, 1987, 'Classic Space', 3],
  cas002: [22.0, 48.0, 1984, 'Castle', 4],
  cas101: [16.5, 36.0, 1990, 'Castle', 3],
  lor001: [6.4, 10.5, 2012, 'Lord of the Rings', 4],
  lor015: [24.0, 38.0, 2012, 'Lord of the Rings', 1],
  lor034: [32.0, 49.0, 2012, 'Lord of the Rings', 1],
  lor063: [38.0, 58.0, 2013, 'Lord of the Rings', 1],
  pir001: [9.5, 19.5, 1989, 'Pirates', 6],

  // === Collectible Minifigures (Series 25–27, D&D, Space) ===
  col425: [9.4, 12.2, 2024, 'Collectible Minifigures', 1],
  col445: [8.8, 11.4, 2024, 'Collectible Minifigures', 1],
  col448: [8.9, 11.9, 2024, 'Collectible Minifigures', 1],
  col2608: [5.4, 6.9, 2024, 'Collectible Minifigures', 1],
  col2612: [4.5, 5.8, 2024, 'Collectible Minifigures', 1],
  col2701: [12.2, 14.9, 2025, 'Collectible Minifigures', 1],
  dnd001: [6.4, 8.2, 2024, 'Collectible Minifigures', 1],
  dnd005: [9.8, 12.6, 2024, 'Collectible Minifigures', 1],
  dnd008: [7.9, 10.2, 2024, 'Collectible Minifigures', 1],
  dnd011: [6.7, 8.2, 2024, 'Collectible Minifigures', 1]
};

export function lookupSeedPrice(figId: string): SeedPriceTuple | undefined {
  const clean = figId.trim().toLowerCase();
  if (!clean) return undefined;
  if (MINIFIG_PRICE_SEEDS[clean]) return MINIFIG_PRICE_SEEDS[clean];
  // Si Brickognize devuelve variante con sufijo (ej. sw0585a) y tenemos base sw0585
  const baseId = clean.replace(/[a-z]$/, '');
  if (baseId !== clean && MINIFIG_PRICE_SEEDS[baseId]) {
    return MINIFIG_PRICE_SEEDS[baseId];
  }
  return undefined;
}
