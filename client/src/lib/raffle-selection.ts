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
export const formatUSDT=(cents:number)=>(cents/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' USDT';
export const discountPercent = (quantity: number) => quantity >= 5 ? 15 : quantity >= 3 ? 10 : 0;
