import {it,expect} from 'vitest';
import {federalWinner} from '../../client/src/lib/federal-draw';
import {normalizePhone,displayPhone,validPhone} from '../../client/src/lib/contact-phone';
it('uses the exact purchased number and respects the first-to-fifth prize order',()=>{
 expect(federalWinner(['40847','01001','01200','12345','99999'],[1001,847])).toEqual({number:847,prize:1});
 expect(federalWinner(['001201','050000','000000','010847','010001'],[847,1])).toEqual({number:847,prize:4});
 expect(federalWinner(['12000','01201','56789','90848','90846'],[847])).toBeNull();
 expect(federalWinner(['01200','00001','00123','00456','00789'],[1,1200])).toEqual({number:1200,prize:1});
 expect(()=>federalWinner(['847'],[847])).toThrow();
});
it('preserves international payment contact numbers while formatting Brazilian numbers',()=>{
 expect(normalizePhone('(11) 99999-9999','55')).toBe('+5511999999999');
 expect(displayPhone('+5511999999999','55')).toBe('(11) 99999-9999');
 expect(normalizePhone('+351 912 345 678','55')).toBe('+351912345678');
 expect(validPhone('+351912345678','351')).toBe(true);
 expect(validPhone('+551234','55')).toBe(false);
});
