/** JSON facts with exact number lexemes. No conversion of PostgreSQL numeric
 * values to IEEE doubles; no evaluation, duplicate keys or ambiguous tags. */
export function losslessJsonFacts(raw,{omitTopLevel=[]}={}){
 if(typeof raw!=='string'||Buffer.byteLength(raw)>8*1024*1024)throw Error('LOSSLESS_JSON_SIZE');
 let position=0;const whitespace=()=>{while(/[\x20\t\r\n]/.test(raw[position]??'!'))position++;};
 const fail=()=>{throw Error('LOSSLESS_JSON_INVALID');};
 function string(){
  const start=position++;let escape=false;
  for(;position<raw.length;position++){
   const char=raw[position];if(!escape&&char==='"'){position++;try{return JSON.parse(raw.slice(start,position));}catch{fail();}}
   if(!escape&&char==='\\')escape=true;else escape=false;
  }fail();
 }
 function value(depth=0){
  if(depth>128)fail();whitespace();const char=raw[position];
  if(char==='"')return ['string',string()];
  if(char==='{'){
   position++;whitespace();const entries=[],keys=new Set();
   if(raw[position]!=='}')for(;;){
    whitespace();if(raw[position]!=='"')fail();const key=string();if(keys.has(key))fail();keys.add(key);
    whitespace();if(raw[position++]!==':')fail();const child=value(depth+1);
    if(depth!==0||!omitTopLevel.includes(key))entries.push([key,child]);
    whitespace();if(raw[position]!==',')break;position++;
   }
   if(raw[position++]!=='}')fail();return ['object',entries.sort(([a],[b])=>a<b?-1:a>b?1:0)];
  }
  if(char==='['){
   position++;whitespace();const entries=[];
   if(raw[position]!==']')for(;;){entries.push(value(depth+1));whitespace();if(raw[position]!==',')break;position++;}
   if(raw[position++]!==']')fail();return ['array',entries];
  }
  for(const literal of ['true','false','null'])if(raw.startsWith(literal,position)){position+=literal.length;return [literal];}
  const number=raw.slice(position).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/);
  if(!number)fail();position+=number[0].length;return ['number',number[0]];
 }
 const result=value();whitespace();if(position!==raw.length)fail();return result;
}
