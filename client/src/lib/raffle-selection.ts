export const SELECTION_KEY = 'matuto-raffle-selection-v1';
export function readSelection(): number[] {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(SELECTION_KEY) || '[]');
    if (!Array.isArray(value) || value.length > 1200 || value.some(n => !Number.isInteger(n) || n < 1 || n > 1200)) return [];
    return [...new Set(value)].sort((a,b)=>a-b);
  } catch { return []; }
}
export function saveSelection(numbers: number[]) {
  try { sessionStorage.setItem(SELECTION_KEY,JSON.stringify(numbers)); } catch { /* Selection still works in memory when storage is blocked. */ }
}
export const formatUSD=(cents:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'USD'}).format(cents/100);
export const discountPercent = (quantity: number) => quantity >= 5 ? 15 : quantity >= 3 ? 10 : 0;
