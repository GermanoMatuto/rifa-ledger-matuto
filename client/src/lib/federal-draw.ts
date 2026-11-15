// Direct match only: never maps a result to a buyer's position or a nearby number.
export function federalWinner(prizes:string[],paidNumbers:number[]){
 if(prizes.length!==5 || prizes.some(value=>!/^\d{5,6}$/.test(value)))throw new Error('Informe os cinco números oficiais completos, na ordem dos prêmios.');
 if(paidNumbers.some(n=>!Number.isInteger(n)||n<1||n>1200)||new Set(paidNumbers).size!==paidNumbers.length)throw new Error('Lista de participantes inválida.');
 const paid=new Set(paidNumbers);
 for(let index=0;index<5;index++){const number=Number(prizes[index].slice(-4));if(number>=1&&number<=1200&&paid.has(number))return{number,prize:index+1};}
 return null;
}
