/** Western digits -> Arabic-Indic digits, for player-facing text (the UI shows ٣ not 3). */
export const arabicNum = (n: number | string) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
